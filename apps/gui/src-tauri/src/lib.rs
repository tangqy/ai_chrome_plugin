mod commands;
mod database;
mod scheduler;
mod tracing_context;

use commands::git::{
    open_repository, get_current_branch, list_branches, switch_branch,
    get_commit_history, search_commits, get_commit_detail,
};
use commands::logs::{
    get_logs, get_logs_by_trace, write_log, cleanup_logs, get_current_trace,
};
use commands::service::{get_bridge_status, start_bridge, stop_bridge};
use scheduler::{Scheduler, get_cron_jobs};
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

pub struct AppState {
    pub bridge_process: Arc<Mutex<Option<tokio::process::Child>>>,
    pub bridge_start_time: Arc<Mutex<Option<std::time::Instant>>>,
    pub database: Arc<database::Database>,
    pub scheduler: Arc<Mutex<Scheduler>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let subscriber = tracing_subscriber::registry()
        .with(fmt::layer().with_target(true))
        .with(EnvFilter::from_default_env().add_directive("wujie_gui=info".parse().unwrap()));

    tracing::subscriber::set_global_default(subscriber)
        .expect("Failed to set tracing subscriber");

    tracing::info!("Starting Wujie AI GUI");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            tracing::info!("Initializing app state...");
            
            let app_data_dir = app.path().app_data_dir()
                .expect("Failed to get app data directory");
            
            let db = Arc::new(
                database::Database::new(app_data_dir)
                    .expect("Failed to initialize database")
            );
            
            let scheduler = Scheduler::new();
            let scheduler = Arc::new(Mutex::new(scheduler));
            
            let state = AppState {
                bridge_process: Arc::new(Mutex::new(None)),
                bridge_start_time: Arc::new(Mutex::new(None)),
                database: db,
                scheduler,
            };
            
            app.manage(state);

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match start_bridge(app_handle.state::<AppState>()).await {
                    Ok(()) => {}
                    Err(err) => tracing::error!("Auto-start bridge failed: {}", err),
                }
            });
            
            tracing::info!("App setup complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_repository,
            get_current_branch,
            list_branches,
            switch_branch,
            get_commit_history,
            search_commits,
            get_commit_detail,
            get_bridge_status,
            start_bridge,
            stop_bridge,
            get_logs,
            get_logs_by_trace,
            write_log,
            cleanup_logs,
            get_current_trace,
            get_cron_jobs,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
                // 阻塞式地杀掉子进程，因为如果是异步的，可能 Tauri 直接退出了，子进程变成了孤儿
                let state = app_handle.state::<AppState>();
                let process_clone = state.bridge_process.clone();
                // 由于我们在 run 循环里，直接起一个 blocking 线程去杀
                std::thread::spawn(move || {
                    let rt = tokio::runtime::Runtime::new().unwrap();
                    rt.block_on(async {
                        let mut process = process_clone.lock().await;
                        if let Some(mut child) = process.take() {
                            let _ = child.kill().await;
                        }
                    });
                }).join().unwrap_or_default();
            }
        });
}
