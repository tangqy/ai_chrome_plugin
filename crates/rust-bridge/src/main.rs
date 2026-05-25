use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use rust_shared::protocol::{BridgeRequest, BridgeResponse};
use tokio::io::{self, AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::broadcast;
use tokio::sync::Mutex;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LogTarget {
    Terminal,
    File,
    Both,
}

mod log_store;
mod mcp_tools;
mod nl_parser;
mod session;
mod validation;
mod ws_handlers;

use session::{ConsoleErrorEvent, SessionInfo, SharedErrors, SharedPrintHash, SharedSessions};
use validation::SharedHumanFeedback;
use log_store::SharedLogStore;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let errors: SharedErrors = Arc::new(Mutex::new(Vec::<ConsoleErrorEvent>::new()));
    let sessions: SharedSessions = Arc::new(Mutex::new(std::collections::HashMap::<
        i32,
        SessionInfo,
    >::new()));
    let last_print_hash: SharedPrintHash = Arc::new(Mutex::new(String::new()));
    let (ws_broadcast, _) = broadcast::channel::<String>(128);
    let human_feedback: SharedHumanFeedback = Arc::new(Mutex::new(std::collections::HashMap::<
        String,
        Vec<rust_shared::protocol::HumanFeedbackItem>,
    >::new()));
    let log_store: SharedLogStore = Arc::new(
        log_store::LogStore::new().expect("Failed to open log database (~/.wujie/wujie_bridge.db)")
    );

    let ws_errors = errors.clone();
    let ws_sessions = sessions.clone();
    let ws_print_hash = last_print_hash.clone();
    let log_target = Arc::new(Mutex::new(LogTarget::Both));
    let ws_log_target = log_target.clone();
    let ws_sender = ws_broadcast.clone();
    let ws_human_feedback = human_feedback.clone();
    let ws_log_store = log_store.clone();
    tokio::spawn(async move {
        if let Err(err) = ws_handlers::run_ws_server(
            ws_errors,
            ws_sessions,
            ws_print_hash,
            ws_log_target,
            ws_sender,
            ws_human_feedback,
            ws_log_store,
        )
        .await
        {
            eprintln!("ws server error: {err}");
        }
    });

    let cleanup_store = log_store.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(3600));
        loop {
            interval.tick().await;
            match cleanup_store.cleanup_old(7) {
                Ok(count) => {
                    if count > 0 {
                        eprintln!("[bridge] cleaned up {count} old log events");
                    }
                }
                Err(e) => eprintln!("[bridge] log cleanup failed: {e}"),
            }
        }
    });

    run_stdio_loop(errors, sessions, human_feedback, ws_broadcast, log_store).await
}

async fn run_stdio_loop(
    errors: SharedErrors,
    sessions: SharedSessions,
    human_feedback: SharedHumanFeedback,
    ws_broadcast: broadcast::Sender<String>,
    log_store: SharedLogStore,
) -> anyhow::Result<()> {
    let stdin = io::stdin();
    let mut lines = BufReader::new(stdin).lines();
    let mut stdout = io::stdout();

    while let Some(line) = lines.next_line().await? {
        let req: BridgeRequest = match parse_input_line(&line) {
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

        let resp = mcp_tools::handle_request(
            req,
            errors.clone(),
            sessions.clone(),
            human_feedback.clone(),
            ws_broadcast.clone(),
            log_store.clone(),
            now_ms(),
        )
        .await;
        stdout
            .write_all(format!("{}\n", serde_json::to_string(&resp)?).as_bytes())
            .await?;
        stdout.flush().await?;
    }

    Ok(())
}

fn parse_input_line(line: &str) -> Result<BridgeRequest, anyhow::Error> {
    if let Ok(req) = serde_json::from_str::<BridgeRequest>(line) {
        return Ok(req);
    }
    let request_id = format!("nl-{}", now_ms());
    if let Some(req) = nl_parser::parse_natural_language(line, request_id) {
        return Ok(req);
    }
    Err(anyhow::anyhow!("unsupported input"))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
