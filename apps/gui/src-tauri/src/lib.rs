mod commands;

use commands::service::{get_bridge_status, start_bridge, stop_bridge};
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

pub struct AppState {
    pub bridge_process: Arc<Mutex<Option<tokio::process::Child>>>,
    pub bridge_start_time: Arc<Mutex<Option<std::time::Instant>>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(EnvFilter::from_default_env().add_directive("wujie_gui=info".parse().unwrap()))
        .init();

    tracing::info!("Starting Wujie AI GUI");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            bridge_process: Arc::new(Mutex::new(None)),
            bridge_start_time: Arc::new(Mutex::new(None)),
        })
        .invoke_handler(tauri::generate_handler![
            get_bridge_status,
            start_bridge,
            stop_bridge,
        ])
        .setup(|app| {
            tracing::info!("Tauri app setup complete");
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
