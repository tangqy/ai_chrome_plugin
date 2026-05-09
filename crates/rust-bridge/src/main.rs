use std::time::{SystemTime, UNIX_EPOCH};

use rust_shared::protocol::{BridgeRequest, BridgeResponse};
use tokio::io::{self, AsyncBufReadExt, AsyncWriteExt, BufReader};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
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
        };

        stdout
            .write_all(format!("{}\n", serde_json::to_string(&resp)?).as_bytes())
            .await?;
        stdout.flush().await?;
    }

    Ok(())
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
