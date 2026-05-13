use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use rust_shared::protocol::{BridgeRequest, BridgeResponse};
use tokio::io::{self, AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::Mutex;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LogTarget {
    Terminal,
    File,
    Both,
}

mod mcp_tools;
mod nl_parser;
mod session;
mod ws_handlers;

use session::{ConsoleErrorEvent, SessionInfo, SharedErrors, SharedPrintHash, SharedSessions};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let errors: SharedErrors = Arc::new(Mutex::new(Vec::<ConsoleErrorEvent>::new()));
    let sessions: SharedSessions =
        Arc::new(Mutex::new(std::collections::HashMap::<i32, SessionInfo>::new()));
    let last_print_hash: SharedPrintHash = Arc::new(Mutex::new(String::new()));

    let ws_errors = errors.clone();
    let ws_sessions = sessions.clone();
    let ws_print_hash = last_print_hash.clone();
    let log_target = Arc::new(Mutex::new(LogTarget::Both));
    let ws_log_target = log_target.clone();
    tokio::spawn(async move {
        if let Err(err) =
            ws_handlers::run_ws_server(ws_errors, ws_sessions, ws_print_hash, ws_log_target).await
        {
            eprintln!("ws server error: {err}");
        }
    });

    run_stdio_loop(errors, sessions).await
}

async fn run_stdio_loop(errors: SharedErrors, sessions: SharedSessions) -> anyhow::Result<()> {
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

        let resp = mcp_tools::handle_request(req, errors.clone(), sessions.clone(), now_ms()).await;
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
