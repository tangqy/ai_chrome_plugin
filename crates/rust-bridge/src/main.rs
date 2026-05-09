use std::time::{SystemTime, UNIX_EPOCH};
use std::sync::Arc;
use std::collections::HashMap;

use futures_util::{SinkExt, StreamExt};
use rust_shared::protocol::{BridgeRequest, BridgeResponse, ConsoleErrorItem, SessionItem};
use tokio::net::{TcpListener, TcpStream};
use tokio::io::{self, AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::Mutex;
use tokio::time::{interval, Duration};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ConsoleErrorEvent {
    message: String,
    url: Option<String>,
    tab_id: Option<i32>,
    ts: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SessionInfo {
    tab_id: i32,
    url: String,
    last_seen_ts: u64,
    error_count: u64,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let errors = Arc::new(Mutex::new(Vec::<ConsoleErrorEvent>::new()));
    let sessions = Arc::new(Mutex::new(HashMap::<i32, SessionInfo>::new()));
    let last_print_hash = Arc::new(Mutex::new(String::new()));

    let ws_errors = errors.clone();
    let ws_sessions = sessions.clone();
    let ws_print_hash = last_print_hash.clone();
    tokio::spawn(async {
        if let Err(err) = run_ws_server(ws_errors, ws_sessions, ws_print_hash).await {
            eprintln!("ws server error: {err}");
        }
    });

    let stdin = io::stdin();
    let mut lines = BufReader::new(stdin).lines();
    let mut stdout = io::stdout();

    while let Some(line) = lines.next_line().await? {
        let req: BridgeRequest = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(err) => {
                let fallback = BridgeResponse::Error {
                    request_id: "unknown".to_string(),
                    code: "bad_json".to_string(),
                    message: err.to_string(),
                };
                stdout
                    .write_all(format!("{}\n", serde_json::to_string(&fallback)?).as_bytes())
                    .await?;
                stdout.flush().await?;
                continue;
            }
        };

        let resp = match req {
            BridgeRequest::Ping { request_id } => BridgeResponse::Pong {
                request_id,
                ts: now_ms(),
            },
            BridgeRequest::SyncData { request_id, .. } => BridgeResponse::SyncResult {
                request_id,
                ok: true,
                count: 0,
            },
            BridgeRequest::GetConsoleErrors { request_id } => {
                let guard = errors.lock().await;
                let items = guard
                    .iter()
                    .rev()
                    .take(50)
                    .map(|e| ConsoleErrorItem {
                        message: e.message.clone(),
                        url: e.url.clone(),
                        tab_id: e.tab_id,
                        ts: e.ts,
                    })
                    .collect::<Vec<_>>();
                BridgeResponse::ConsoleErrors {
                    request_id,
                    count: guard.len(),
                    items,
                }
            }
            BridgeRequest::GetSessions { request_id } => {
                let guard = sessions.lock().await;
                let items = guard
                    .values()
                    .map(|s| SessionItem {
                        tab_id: s.tab_id,
                        url: s.url.clone(),
                        last_seen_ts: s.last_seen_ts,
                        error_count: s.error_count,
                    })
                    .collect::<Vec<_>>();
                BridgeResponse::Sessions {
                    request_id,
                    count: items.len(),
                    items,
                }
            }
        };

        stdout
            .write_all(format!("{}\n", serde_json::to_string(&resp)?).as_bytes())
            .await?;
        stdout.flush().await?;
    }

    Ok(())
}

async fn run_ws_server(
    errors: Arc<Mutex<Vec<ConsoleErrorEvent>>>,
    sessions: Arc<Mutex<HashMap<i32, SessionInfo>>>,
    last_print_hash: Arc<Mutex<String>>,
) -> anyhow::Result<()> {
    let listener = TcpListener::bind("127.0.0.1:8787").await?;
    loop {
        let (stream, _) = listener.accept().await?;
        let errors = errors.clone();
        let sessions = sessions.clone();
        let last_print_hash = last_print_hash.clone();
        tokio::spawn(async move {
            if let Err(err) = handle_ws_connection(stream, errors, sessions, last_print_hash).await {
                eprintln!("ws connection error: {err}");
            }
        });
    }
}

async fn handle_ws_connection(
    stream: TcpStream,
    errors: Arc<Mutex<Vec<ConsoleErrorEvent>>>,
    sessions: Arc<Mutex<HashMap<i32, SessionInfo>>>,
    last_print_hash: Arc<Mutex<String>>,
) -> anyhow::Result<()> {
    let ws_stream = accept_async(stream).await?;
    let (mut write, mut read) = ws_stream.split();
    let mut ticker = interval(Duration::from_secs(5));

    loop {
        tokio::select! {
            _ = ticker.tick() => {
                write.send(Message::Text("{\"type\":\"ping\"}".to_string())).await?;
            }
            maybe_msg = read.next() => {
                match maybe_msg {
                    Some(Ok(Message::Text(text))) => {
                        if text.contains("\"type\":\"hello\"") {
                            let welcome = format!("{{\"type\":\"welcome\",\"ts\":{}}}", now_ms());
                            write.send(Message::Text(welcome)).await?;
                            continue;
                        }

                        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
                            let typ = value.get("type").and_then(|v| v.as_str()).unwrap_or_default();

                            if typ == "console_error" {
                                let payload = value.get("payload").cloned().unwrap_or_default();
                                let message = payload
                                    .get("message")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("unknown error")
                                    .to_string();
                                let url = payload.get("url").and_then(|v| v.as_str()).map(ToString::to_string);
                                let tab_id = payload
                                    .get("tabId")
                                    .and_then(|v| v.as_i64())
                                    .map(|v| v as i32);
                                let event = ConsoleErrorEvent {
                                    message,
                                    url: url.clone(),
                                    tab_id,
                                    ts: now_ms(),
                                };

                                let mut guard = errors.lock().await;
                                guard.push(event);
                                if guard.len() > 500 {
                                    let overflow = guard.len() - 500;
                                    guard.drain(0..overflow);
                                }

                                if let Some(tab_id_value) = tab_id {
                                    let mut sessions_guard = sessions.lock().await;
                                    let entry = sessions_guard.entry(tab_id_value).or_insert(SessionInfo {
                                        tab_id: tab_id_value,
                                        url: url.clone().unwrap_or_else(|| "-".to_string()),
                                        last_seen_ts: now_ms(),
                                        error_count: 0,
                                    });
                                    if let Some(u) = url.clone() {
                                        entry.url = u;
                                    }
                                    entry.error_count += 1;
                                    entry.last_seen_ts = now_ms();
                                }
                            }

                            if typ == "page_context" {
                                let payload = value.get("payload").cloned().unwrap_or_default();
                                let tab_id = payload.get("tabId").and_then(|v| v.as_i64()).map(|v| v as i32);
                                let url = payload
                                    .get("url")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("-")
                                    .to_string();
                                if let Some(tab_id_value) = tab_id {
                                    let mut sessions_guard = sessions.lock().await;
                                    let entry = sessions_guard.entry(tab_id_value).or_insert(SessionInfo {
                                        tab_id: tab_id_value,
                                        url: url.clone(),
                                        last_seen_ts: now_ms(),
                                        error_count: 0,
                                    });
                                    entry.url = url;
                                    entry.last_seen_ts = now_ms();
                                }
                            }

                            if typ == "get_console_errors" {
                                let guard = errors.lock().await;
                                let sessions_guard = sessions.lock().await;
                                let count = guard.len();
                                let digest = guard
                                    .iter()
                                    .rev()
                                    .take(5)
                                    .map(|item| format!("{:?}|{:?}|{}", item.tab_id, item.url, item.message))
                                    .collect::<Vec<_>>()
                                    .join("||");
                                let hash = format!("{count}:{digest}");

                                let mut print_guard = last_print_hash.lock().await;
                                if *print_guard != hash {
                                    eprintln!("[bridge] console errors total: {count}");
                                    for item in guard.iter().rev().take(5) {
                                        eprintln!(
                                            "[bridge] err tab={:?} url={:?} msg={}",
                                            item.tab_id, item.url, item.message
                                        );
                                    }
                                    *print_guard = hash;
                                }
                                let resp = serde_json::json!({
                                    "type": "console_errors",
                                    "count": count,
                                    "items": guard.iter().rev().take(20).collect::<Vec<_>>(),
                                    "sessions": sessions_guard.values().cloned().collect::<Vec<_>>()
                                });
                                write.send(Message::Text(resp.to_string())).await?;
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => {}
                    Some(Err(err)) => return Err(err.into()),
                }
            }
        }
    }

    Ok(())
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
