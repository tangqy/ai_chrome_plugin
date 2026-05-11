use rust_shared::protocol::{
    BridgeRequest, BridgeResponse, ConsoleErrorItem, SessionItem, StatusItem,
};

use crate::session::{SharedErrors, SharedSessions};

pub async fn handle_request(
    req: BridgeRequest,
    errors: SharedErrors,
    sessions: SharedSessions,
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
    }
}
