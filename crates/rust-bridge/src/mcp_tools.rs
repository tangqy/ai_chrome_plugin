use rust_shared::protocol::{
    BridgeRequest, BridgeResponse, ConsoleErrorItem, SessionItem, StatusItem, TraceBundleSummary,
};

use crate::log_store::SharedLogStore;
use crate::session::{SharedErrors, SharedSessions};
use crate::validation::{get_feedback, SharedHumanFeedback};
use tokio::sync::broadcast::Sender;

pub async fn handle_request(
    req: BridgeRequest,
    errors: SharedErrors,
    sessions: SharedSessions,
    human_feedback: SharedHumanFeedback,
    ws_broadcast: Sender<String>,
    log_store: SharedLogStore,
    now_ms: u64,
) -> BridgeResponse {
    match req {
        BridgeRequest::Ping { request_id } => BridgeResponse::Pong {
            request_id,
            ts: now_ms,
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
        BridgeRequest::GetStatus { request_id } => {
            let errors_guard = errors.lock().await;
            let sessions_guard = sessions.lock().await;
            BridgeResponse::Status {
                request_id,
                status: StatusItem {
                    ts: now_ms,
                    total_errors: errors_guard.len(),
                    total_sessions: sessions_guard.len(),
                },
            }
        }
        BridgeRequest::ValidationRequestHumanAction {
            request_id,
            payload,
        } => {
            let msg = serde_json::json!({
                "type": "validation_request_human_action",
                "ts": now_ms,
                "payload": payload
            })
            .to_string();
            match ws_broadcast.send(msg) {
                Ok(_) => BridgeResponse::ValidationRequestHumanActionResult {
                    request_id,
                    ok: true,
                },
                Err(err) => BridgeResponse::Error {
                    request_id,
                    code: "ws_broadcast_failed".to_string(),
                    message: err.to_string(),
                },
            }
        }
        BridgeRequest::ValidationCollectTraceBundle {
            request_id,
            payload,
        } => {
            let feedback = get_feedback(&human_feedback, &payload.task_id).await;
            let guard = errors.lock().await;
            let console_items = guard
                .iter()
                .rev()
                .take(10)
                .map(|e| ConsoleErrorItem {
                    message: e.message.clone(),
                    url: e.url.clone(),
                    tab_id: e.tab_id,
                    ts: e.ts,
                })
                .collect::<Vec<_>>();
            let bundle = TraceBundleSummary {
                task_id: payload.task_id.clone(),
                ts: now_ms,
                feedback,
                console_errors: console_items,
                log_events: log_store.query_by_task_id(&payload.task_id, 200),
            };
            BridgeResponse::ValidationCollectTraceBundleResult {
                request_id,
                ok: true,
                bundle,
            }
        }
    }
}
