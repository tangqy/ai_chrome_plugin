use futures_util::stream::SplitSink;
use futures_util::{SinkExt, StreamExt};
use similar::TextDiff;
use std::sync::Arc;
use tokio::fs::{create_dir_all, OpenOptions};
use tokio::io::AsyncWriteExt;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::broadcast::Sender;
use tokio::sync::Mutex;
use tokio::time::{interval, Duration};
use tokio_tungstenite::{accept_async, tungstenite::Message, WebSocketStream};

use crate::log_store::SharedLogStore;
use crate::session::{
    ConsoleErrorEvent, SessionInfo, SharedErrors, SharedPrintHash, SharedSessions,
};
use crate::validation::{get_feedback, push_feedback, SharedHumanFeedback};
use crate::LogTarget;

type SharedLogTarget = Arc<Mutex<LogTarget>>;

pub type WsBroadcast = Sender<String>;

pub async fn run_ws_server(
    errors: SharedErrors,
    sessions: SharedSessions,
    last_print_hash: SharedPrintHash,
    log_target: SharedLogTarget,
    ws_broadcast: WsBroadcast,
    human_feedback: SharedHumanFeedback,
    log_store: SharedLogStore,
) -> anyhow::Result<()> {
    let listener = TcpListener::bind("127.0.0.1:8787").await?;
    loop {
        let (stream, _) = listener.accept().await?;
        let errors = errors.clone();
        let sessions = sessions.clone();
        let last_print_hash = last_print_hash.clone();
        let log_target = log_target.clone();
        let ws_broadcast = ws_broadcast.clone();
        let human_feedback = human_feedback.clone();
        let log_store = log_store.clone();
        tokio::spawn(async move {
            if let Err(err) = handle_ws_connection(
                stream,
                errors,
                sessions,
                last_print_hash,
                log_target,
                ws_broadcast,
                human_feedback,
                log_store,
            )
            .await
            {
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
    log_target: SharedLogTarget,
    ws_broadcast: WsBroadcast,
    human_feedback: SharedHumanFeedback,
    log_store: SharedLogStore,
) -> anyhow::Result<()> {
    let ws_stream = accept_async(stream).await?;
    let (mut write, mut read) = ws_stream.split();
    let mut ticker = interval(Duration::from_secs(5));
    let mut rx = ws_broadcast.subscribe();

    loop {
        tokio::select! {
            _ = ticker.tick() => {
                write.send(Message::Text("{\"type\":\"ping\"}".to_string())).await?;
            }
            maybe_push = rx.recv() => {
                match maybe_push {
                    Ok(text) => {
                        write.send(Message::Text(text)).await?;
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {}
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                }
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
                            handle_ws_json(
                                value,
                                &mut write,
                                &errors,
                                &sessions,
                                &last_print_hash,
                                &log_target,
                                &human_feedback,
                                &ws_broadcast,
                                &log_store,
                            )
                            .await?;
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
    log_target: &SharedLogTarget,
    human_feedback: &SharedHumanFeedback,
    ws_broadcast: &WsBroadcast,
    log_store: &SharedLogStore,
) -> anyhow::Result<()> {
    let typ = value
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let request_id = value
        .get("requestId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if typ == "set_log_target" {
        let target = value
            .get("payload")
            .and_then(|p| p.get("target"))
            .and_then(|v| v.as_str())
            .unwrap_or("both");
        let next = match target {
            "terminal" => LogTarget::Terminal,
            "file" => LogTarget::File,
            _ => LogTarget::Both,
        };
        let mut guard = log_target.lock().await;
        *guard = next;
        return Ok(());
    }

    if typ == "console_error" {
        let payload = value.get("payload").cloned().unwrap_or_default();
        let message = payload
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown error")
            .to_string();
        let url = payload
            .get("url")
            .and_then(|v| v.as_str())
            .map(ToString::to_string);
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
        guard.push(event.clone());
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
        write_line(
            log_target,
            &format_console_line(&event),
            event.url.as_deref(),
            event.ts,
        )
        .await;
        return Ok(());
    }

    if typ == "network_request" {
        let payload = value.get("payload").cloned().unwrap_or_default();
        let tab_id = payload
            .get("tabId")
            .and_then(|v| v.as_i64())
            .map(|v| v as i32);
        let request_id = payload
            .get("requestId")
            .and_then(|v| v.as_str())
            .unwrap_or("-");
        let method = payload
            .get("method")
            .and_then(|v| v.as_str())
            .unwrap_or("GET");
        let url = payload.get("url").and_then(|v| v.as_str()).unwrap_or("-");
        let resource_type = payload
            .get("resourceType")
            .and_then(|v| v.as_str())
            .unwrap_or("-");
        let ts = now_ms();
        let line = serde_json::json!({
            "kind": "network_request",
            "ts": ts,
            "tabId": tab_id,
            "requestId": request_id,
            "resourceType": resource_type,
            "method": method,
            "url": url
        })
        .to_string();
        write_line(log_target, &line, Some(url), ts).await;
        return Ok(());
    }

    if typ == "network_body_chunk" {
        let payload = value.get("payload").cloned().unwrap_or_default();
        let ts = now_ms();
        let url = payload.get("url").and_then(|v| v.as_str()).unwrap_or("-");
        let line = serde_json::json!({
            "kind": "network_body_chunk",
            "ts": ts,
            "tabId": payload.get("tabId").and_then(|v| v.as_i64()),
            "requestId": payload.get("requestId").and_then(|v| v.as_str()).unwrap_or("-"),
            "method": payload.get("method").and_then(|v| v.as_str()).unwrap_or("-"),
            "url": url,
            "part": payload.get("part").and_then(|v| v.as_str()).unwrap_or("-"),
            "chunkIndex": payload.get("chunkIndex").and_then(|v| v.as_u64()).unwrap_or(0),
            "totalChunks": payload.get("totalChunks").and_then(|v| v.as_u64()).unwrap_or(1),
            "contentSha256": payload.get("contentSha256").and_then(|v| v.as_str()).unwrap_or(""),
            "chunkSha256": payload.get("chunkSha256").and_then(|v| v.as_str()).unwrap_or(""),
            "chunk": payload.get("chunk").and_then(|v| v.as_str()).unwrap_or("")
        })
        .to_string();
        write_line(log_target, &line, Some(url), ts).await;
        return Ok(());
    }

    if typ == "page_context" {
        let payload = value.get("payload").cloned().unwrap_or_default();
        let tab_id = payload
            .get("tabId")
            .and_then(|v| v.as_i64())
            .map(|v| v as i32);
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
        return Ok(());
    }

    if typ == "validation_human_feedback" {
        let payload = value.get("payload").cloned().unwrap_or_default();
        let task_id = payload
            .get("taskId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let trace_id = payload
            .get("traceId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let step_id = payload
            .get("stepId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if task_id.is_empty() || trace_id.is_empty() || step_id.is_empty() {
            return Ok(());
        }
        let feedback = rust_shared::protocol::HumanFeedbackItem {
            task_id,
            trace_id,
            step_id,
            result: payload
                .get("result")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string(),
            exception_type: payload
                .get("exceptionType")
                .and_then(|v| v.as_str())
                .map(ToString::to_string),
            comment: payload
                .get("comment")
                .and_then(|v| v.as_str())
                .map(ToString::to_string),
            screenshots: payload
                .get("screenshots")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default(),
            ts: payload
                .get("ts")
                .and_then(|v| v.as_u64())
                .unwrap_or_else(now_ms),
        };
        push_feedback(human_feedback, feedback).await;
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
            let ts = now_ms();
            let summary = serde_json::json!({
                "kind": "console_error_summary",
                "ts": ts,
                "count": count
            })
            .to_string();
            write_line(log_target, &summary, None, ts).await;
            for item in guard.iter().rev().take(5) {
                write_line(
                    log_target,
                    &format_console_line(item),
                    item.url.as_deref(),
                    item.ts,
                )
                .await;
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
        let input = value
            .get("payload")
            .and_then(|p| p.get("input"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
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
        let left = value
            .get("payload")
            .and_then(|p| p.get("left"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let right = value
            .get("payload")
            .and_then(|p| p.get("right"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let diff = TextDiff::from_lines(left, right)
            .unified_diff()
            .header("left", "right")
            .to_string();
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

    if typ == "validation_request_human_action" {
        let msg = serde_json::json!({
            "type": "validation_request_human_action",
            "ts": now_ms(),
            "payload": value.get("payload").cloned().unwrap_or_default()
        })
        .to_string();
        let _ = ws_broadcast.send(msg);
        let resp = serde_json::json!({
            "type": "validation_request_human_action_result",
            "requestId": request_id,
            "ok": true
        });
        write.send(Message::Text(resp.to_string())).await?;
        return Ok(());
    }

    if typ == "validation_collect_trace_bundle" {
        let payload = value.get("payload").cloned().unwrap_or_default();
        let task_id = payload
            .get("taskId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let feedback = get_feedback(human_feedback, &task_id).await;
        let earliest_ts = feedback.iter().map(|f| f.ts).min().unwrap_or(0);
        let window_start = if earliest_ts > 0 {
            earliest_ts.saturating_sub(60_000)
        } else {
            0
        };
        let recent_errors = {
            let guard = errors.lock().await;
            let mut items: Vec<_> = guard
                .iter()
                .filter(|e| window_start == 0 || e.ts >= window_start)
                .rev()
                .take(20)
                .map(|e| rust_shared::protocol::ConsoleErrorItem {
                    message: e.message.clone(),
                    url: e.url.clone(),
                    tab_id: e.tab_id,
                    ts: e.ts,
                })
                .collect();
            items.reverse();
            items
        };

        let summary = rust_shared::protocol::TraceBundleSummary {
            task_id: task_id.clone(),
            ts: now_ms(),
            feedback,
            console_errors: recent_errors,
            log_events: log_store.query_by_task_id(&task_id, 200),
        };

        let resp = serde_json::json!({
            "type": "validation_collect_trace_bundle_result",
            "requestId": request_id,
            "ok": true,
            "bundle": summary
        });
        write.send(Message::Text(resp.to_string())).await?;
        return Ok(());
    }

    if typ == "validation_human_completed" {
        let msg = serde_json::json!({
            "type": "validation_human_completed",
            "ts": now_ms(),
            "payload": value.get("payload").cloned().unwrap_or_default()
        })
        .to_string();
        let _ = ws_broadcast.send(msg);
        let resp = serde_json::json!({
            "type": "validation_human_completed_result",
            "requestId": request_id,
            "ok": true
        });
        write.send(Message::Text(resp.to_string())).await?;
        return Ok(());
    }

    if typ == "log_event" {
        let payload = value.get("payload").cloned().unwrap_or_default();
        let id = payload
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let trace_id = payload
            .get("traceId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if id.is_empty() || trace_id.is_empty() {
            eprintln!("log_event missing id or traceId, skipping");
            return Ok(());
        }
        let event = rust_shared::protocol::LogEventItem {
            id,
            trace_id,
            task_id: payload
                .get("taskId")
                .and_then(|v| v.as_str())
                .map(String::from),
            step_id: payload
                .get("stepId")
                .and_then(|v| v.as_str())
                .map(String::from),
            source: payload
                .get("source")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string(),
            module: payload
                .get("module")
                .and_then(|v| v.as_str())
                .unwrap_or("app")
                .to_string(),
            kind: payload
                .get("kind")
                .and_then(|v| v.as_str())
                .unwrap_or("custom")
                .to_string(),
            level: payload
                .get("level")
                .and_then(|v| v.as_str())
                .unwrap_or("info")
                .to_string(),
            action: payload
                .get("action")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            message: payload
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            ts: payload
                .get("ts")
                .and_then(|v| v.as_u64())
                .unwrap_or_else(now_ms),
            attrs: payload
                .get("attrs")
                .and_then(|v| serde_json::to_string(v).ok()),
        };
        if let Err(e) = log_store.insert(&event) {
            eprintln!("Failed to insert log event: {e}");
        }
        return Ok(());
    }

    if typ == "log_event_batch" {
        let items = value.get("payload").and_then(|v| v.as_array());
        if let Some(items) = items {
            for item in items {
                let id = item
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let trace_id = item
                    .get("traceId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                if id.is_empty() || trace_id.is_empty() {
                    continue;
                }
                let event = rust_shared::protocol::LogEventItem {
                    id,
                    trace_id,
                    task_id: item
                        .get("taskId")
                        .and_then(|v| v.as_str())
                        .map(String::from),
                    step_id: item
                        .get("stepId")
                        .and_then(|v| v.as_str())
                        .map(String::from),
                    source: item
                        .get("source")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string(),
                    module: item
                        .get("module")
                        .and_then(|v| v.as_str())
                        .unwrap_or("app")
                        .to_string(),
                    kind: item
                        .get("kind")
                        .and_then(|v| v.as_str())
                        .unwrap_or("custom")
                        .to_string(),
                    level: item
                        .get("level")
                        .and_then(|v| v.as_str())
                        .unwrap_or("info")
                        .to_string(),
                    action: item
                        .get("action")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    message: item
                        .get("message")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    ts: item
                        .get("ts")
                        .and_then(|v| v.as_u64())
                        .unwrap_or_else(now_ms),
                    attrs: item
                        .get("attrs")
                        .and_then(|v| serde_json::to_string(v).ok()),
                };
                if let Err(e) = log_store.insert(&event) {
                    eprintln!("Failed to insert batch log event: {e}");
                }
            }
        }
        return Ok(());
    }

    if typ == "log_write" {
        let event_payload = value
            .get("payload")
            .and_then(|v| v.get("event"))
            .cloned()
            .unwrap_or_default();
        let event = rust_shared::protocol::LogEventItem {
            id: event_payload
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            trace_id: event_payload
                .get("traceId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            task_id: event_payload
                .get("taskId")
                .and_then(|v| v.as_str())
                .map(String::from),
            step_id: event_payload
                .get("stepId")
                .and_then(|v| v.as_str())
                .map(String::from),
            source: event_payload
                .get("source")
                .and_then(|v| v.as_str())
                .unwrap_or("ai")
                .to_string(),
            module: event_payload
                .get("module")
                .and_then(|v| v.as_str())
                .unwrap_or("app")
                .to_string(),
            kind: event_payload
                .get("kind")
                .and_then(|v| v.as_str())
                .unwrap_or("ai_trace")
                .to_string(),
            level: event_payload
                .get("level")
                .and_then(|v| v.as_str())
                .unwrap_or("info")
                .to_string(),
            action: event_payload
                .get("action")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            message: event_payload
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            ts: event_payload
                .get("ts")
                .and_then(|v| v.as_u64())
                .unwrap_or_else(now_ms),
            attrs: event_payload
                .get("attrs")
                .and_then(|v| serde_json::to_string(v).ok()),
        };
        let ok = log_store.insert(&event).is_ok();
        let resp = serde_json::json!({
            "type": "log_write_result",
            "requestId": request_id,
            "ok": ok
        });
        write.send(Message::Text(resp.to_string())).await?;
        return Ok(());
    }

    if typ == "log_query" {
        let payload = value.get("payload").cloned().unwrap_or_default();
        let task_id = payload.get("taskId").and_then(|v| v.as_str());
        let trace_id = payload.get("traceId").and_then(|v| v.as_str());
        let level = payload.get("level").and_then(|v| v.as_str());
        let limit = payload
            .get("limit")
            .and_then(|v| v.as_u64())
            .unwrap_or(50)
            .min(200) as usize;
        let events = log_store.query(task_id, trace_id, level, limit);
        let resp = serde_json::json!({
            "type": "log_query_result",
            "requestId": request_id,
            "events": events
        });
        write.send(Message::Text(resp.to_string())).await?;
        return Ok(());
    }

    Ok(())
}

fn format_console_line(item: &ConsoleErrorEvent) -> String {
    serde_json::json!({
        "kind": "console_error",
        "ts": item.ts,
        "tabId": item.tab_id,
        "url": item.url,
        "message": item.message
    })
    .to_string()
}

fn date_string(ts_ms: u64) -> String {
    let secs = (ts_ms / 1000) as i64;
    if let Some(dt) = chrono::DateTime::<chrono::Utc>::from_timestamp(secs, 0) {
        dt.format("%Y-%m-%d").to_string()
    } else {
        "unknown-date".to_string()
    }
}

fn sanitize_domain(raw: &str) -> String {
    let mut s = raw.to_lowercase();
    if let Ok(url) = url::Url::parse(raw) {
        if let Some(host) = url.host_str() {
            s = host.to_string();
        }
    }
    s.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
}

async fn write_line(log_target: &SharedLogTarget, line: &str, url: Option<&str>, ts_ms: u64) {
    let target = *log_target.lock().await;
    if target == LogTarget::Terminal || target == LogTarget::Both {
        eprintln!("{line}");
    }
    if target == LogTarget::File || target == LogTarget::Both {
        if let Err(err) = append_line_to_file(line, url, ts_ms).await {
            eprintln!("[bridge] write log file failed: {err}");
        }
    }
}

async fn append_line_to_file(line: &str, url: Option<&str>, ts_ms: u64) -> anyhow::Result<()> {
    create_dir_all("logs").await?;
    let domain = sanitize_domain(url.unwrap_or("service"));
    let category = detect_log_category(line);
    let path = format!("logs/{}_{}_{}.log", date_string(ts_ms), domain, category);
    let mut f = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .await?;
    f.write_all(format!("{line}\n").as_bytes()).await?;
    Ok(())
}

fn detect_log_category(line: &str) -> &'static str {
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
        if let Some(kind) = v.get("kind").and_then(|x| x.as_str()) {
            if kind.starts_with("network_") {
                return "network";
            }
            if kind.starts_with("console_") {
                return "console";
            }
        }
    }
    "service"
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
