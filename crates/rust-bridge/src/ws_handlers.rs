use futures_util::{SinkExt, StreamExt};
use futures_util::stream::SplitSink;
use similar::TextDiff;
use tokio::net::{TcpListener, TcpStream};
use tokio::time::{interval, Duration};
use tokio_tungstenite::{accept_async, tungstenite::Message, WebSocketStream};

use crate::session::{ConsoleErrorEvent, SessionInfo, SharedErrors, SharedPrintHash, SharedSessions};

pub async fn run_ws_server(
    errors: SharedErrors,
    sessions: SharedSessions,
    last_print_hash: SharedPrintHash,
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
    errors: SharedErrors,
    sessions: SharedSessions,
    last_print_hash: SharedPrintHash,
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
                            handle_ws_json(value, &mut write, &errors, &sessions, &last_print_hash).await?;
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

async fn handle_ws_json(
    value: serde_json::Value,
    write: &mut SplitSink<WebSocketStream<TcpStream>, Message>,
    errors: &SharedErrors,
    sessions: &SharedSessions,
    last_print_hash: &SharedPrintHash,
) -> anyhow::Result<()> {
    let typ = value.get("type").and_then(|v| v.as_str()).unwrap_or_default();
    let request_id = value
        .get("requestId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if typ == "console_error" {
        let payload = value.get("payload").cloned().unwrap_or_default();
        let message = payload
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown error")
            .to_string();
        let url = payload.get("url").and_then(|v| v.as_str()).map(ToString::to_string);
        let tab_id = payload.get("tabId").and_then(|v| v.as_i64()).map(|v| v as i32);
        let event = ConsoleErrorEvent { message, url: url.clone(), tab_id, ts: now_ms() };

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
        return Ok(());
    }

    if typ == "page_context" {
        let payload = value.get("payload").cloned().unwrap_or_default();
        let tab_id = payload.get("tabId").and_then(|v| v.as_i64()).map(|v| v as i32);
        let url = payload.get("url").and_then(|v| v.as_str()).unwrap_or("-").to_string();
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
        return Ok(());
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
                eprintln!("[bridge] err tab={:?} url={:?} msg={}", item.tab_id, item.url, item.message);
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
        return Ok(());
    }

    if typ == "format_json" {
        let input = value.get("payload").and_then(|p| p.get("input")).and_then(|v| v.as_str()).unwrap_or("");
        let resp = match serde_json::from_str::<serde_json::Value>(input) {
            Ok(v) => serde_json::json!({
                "type": "format_json_result",
                "requestId": request_id,
                "ok": true,
                "output": serde_json::to_string_pretty(&v).unwrap_or_else(|_| "{}".to_string())
            }),
            Err(err) => serde_json::json!({
                "type": "format_json_result",
                "requestId": request_id,
                "ok": false,
                "error": err.to_string()
            }),
        };
        write.send(Message::Text(resp.to_string())).await?;
        return Ok(());
    }

    if typ == "diff_text" {
        let left = value.get("payload").and_then(|p| p.get("left")).and_then(|v| v.as_str()).unwrap_or("");
        let right = value.get("payload").and_then(|p| p.get("right")).and_then(|v| v.as_str()).unwrap_or("");
        let diff = TextDiff::from_lines(left, right).unified_diff().header("left", "right").to_string();
        let resp = serde_json::json!({
            "type": "diff_text_result",
            "requestId": request_id,
            "ok": true,
            "output": diff
        });
        write.send(Message::Text(resp.to_string())).await?;
        return Ok(());
    }

    if typ == "network_to_curl" {
        let entries = value
            .get("payload")
            .and_then(|p| p.get("entries"))
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let mut lines: Vec<String> = Vec::new();
        for item in entries {
            let method = item.get("method").and_then(|v| v.as_str()).unwrap_or("GET");
            let url = item.get("url").and_then(|v| v.as_str()).unwrap_or("");
            if url.is_empty() {
                continue;
            }
            let mut cmd = format!("curl -X {} '{}'", shell_escape(method), shell_escape(url));
            if let Some(headers) = item.get("headers").and_then(|h| h.as_object()) {
                for (k, v) in headers {
                    let vv = v.as_str().unwrap_or("");
                    cmd.push_str(&format!(" -H '{}: {}'", shell_escape(k), shell_escape(vv)));
                }
            }
            if let Some(post_data) = item.get("postData").and_then(|v| v.as_str()) {
                if !post_data.is_empty() {
                    cmd.push_str(&format!(" --data '{}'", shell_escape(post_data)));
                }
            }
            lines.push(cmd);
        }
        let resp = serde_json::json!({
            "type": "network_to_curl_result",
            "requestId": request_id,
            "ok": true,
            "output": lines.join("\\n")
        });
        write.send(Message::Text(resp.to_string())).await?;
    }

    Ok(())
}

fn shell_escape(s: &str) -> String {
    s.replace('"', "\\\"").replace('\'', "'\"'\"'")
}

fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
