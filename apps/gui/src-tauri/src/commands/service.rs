use crate::AppState;
use serde::Serialize;
use tauri::State;
use tracing::{error, info};

#[derive(Serialize)]
pub struct BridgeStatus {
    pub running: bool,
    pub pid: Option<u32>,
    pub uptime_secs: Option<u64>,
}

#[tauri::command]
pub async fn get_bridge_status(state: State<'_, AppState>) -> Result<BridgeStatus, String> {
let mut process = state.bridge_process.lock().await;
    let start_time = state.bridge_start_time.lock().await;

if let Some(ref mut child) = *process {
        if child.try_wait().map(|o| o.is_none()).unwrap_or(false) {
            let uptime = start_time
                .as_ref()
                .map(|t| t.elapsed().as_secs())
                .unwrap_or(0);
            Ok(BridgeStatus {
                running: true,
pid: child.id(),
                uptime_secs: Some(uptime),
            })
        } else {
            Ok(BridgeStatus {
                running: false,
                pid: None,
                uptime_secs: None,
            })
        }
    } else {
        Ok(BridgeStatus {
            running: false,
            pid: None,
            uptime_secs: None,
        })
    }
}

#[tauri::command]
pub async fn start_bridge(state: State<'_, AppState>) -> Result<(), String> {
    info!("Starting bridge service...");

    let mut process = state.bridge_process.lock().await;
    let mut start_time = state.bridge_start_time.lock().await;

    if process.is_some() {
        return Err("Bridge is already running".to_string());
    }

    let mut child = tokio::process::Command::new("cargo")
        .args(["run", "-p", "rust-bridge"])
        .current_dir(crate_root())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| {
            error!("Failed to spawn bridge process: {}", e);
            format!("Failed to start bridge: {}", e)
        })?;

    if let Some(stdout) = child.stdout.take() {
        tokio::spawn(async move {
            use tokio::io::AsyncReadExt;
            let mut reader = stdout;
            let mut buf = [0u8; 1024];
            while let Ok(n) = reader.read(&mut buf).await {
                if n == 0 {
                    break;
                }
                let msg = String::from_utf8_lossy(&buf[..n]);
                info!("[bridge] {}", msg.trim_end());
            }
        });
    }

    *process = Some(child);
    *start_time = Some(std::time::Instant::now());

    info!("Bridge started successfully");
    Ok(())
}

#[tauri::command]
pub async fn stop_bridge(state: State<'_, AppState>) -> Result<(), String> {
    info!("Stopping bridge service...");

    let mut process = state.bridge_process.lock().await;
    let mut start_time = state.bridge_start_time.lock().await;

    if let Some(mut child) = process.take() {
        child.kill().await.map_err(|e| {
            error!("Failed to kill bridge process: {}", e);
            format!("Failed to stop bridge: {}", e)
        })?;
        *start_time = None;
        info!("Bridge stopped successfully");
        Ok(())
    } else {
        Err("Bridge is not running".to_string())
    }
}

fn crate_root() -> std::path::PathBuf {
    std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_path_buf()
}
