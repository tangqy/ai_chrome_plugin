use crate::database::{AppLog, Database};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Serialize, Deserialize)]
pub struct LogEntry {
    pub level: String,
    pub message: String,
    pub source: String,
}

#[tauri::command]
pub async fn get_logs(
    db: tauri::State<'_, Arc<Database>>,
    limit: Option<i64>,
) -> Result<Vec<AppLog>, String> {
    let trace_id = uuid::Uuid::new_v4().to_string();
    tracing::info!(trace_id = %trace_id, "Getting logs with limit: {:?}", limit);
    
    db.get_logs(limit.unwrap_or(100))
        .map_err(|e| {
            tracing::error!("Failed to get logs: {}", e);
            e.to_string()
        })
}

#[tauri::command]
pub async fn get_logs_by_trace(
    db: tauri::State<'_, Arc<Database>>,
    trace_id: String,
) -> Result<Vec<AppLog>, String> {
    let current_trace_id = uuid::Uuid::new_v4().to_string();
    tracing::info!(trace_id = %current_trace_id, parent_trace_id = %trace_id, "Getting logs by trace ID");
    
    db.get_logs_by_trace_id(&trace_id)
        .map_err(|e| {
            tracing::error!("Failed to get logs by trace: {}", e);
            e.to_string()
        })
}

#[tauri::command]
pub async fn write_log(
    db: tauri::State<'_, Arc<Database>>,
    entry: LogEntry,
) -> Result<(), String> {
    let trace_id = uuid::Uuid::new_v4().to_string();
    
    db.log(&trace_id, &entry.level, &entry.message, &entry.source)
        .map_err(|e| {
            tracing::error!("Failed to write log: {}", e);
            e.to_string()
        })?;
    
    tracing::info!(trace_id = %trace_id, level = %entry.level, source = %entry.source, "{}", entry.message);
    Ok(())
}

#[tauri::command]
pub async fn cleanup_logs(
    db: tauri::State<'_, Arc<Database>>,
    days: Option<i64>,
) -> Result<usize, String> {
    let trace_id = uuid::Uuid::new_v4().to_string();
    let days = days.unwrap_or(7);
    
    tracing::info!(trace_id = %trace_id, days = %days, "Cleaning up old logs");
    
    db.cleanup_old_logs(days)
        .map_err(|e| {
            tracing::error!("Failed to cleanup logs: {}", e);
            e.to_string()
        })
}

#[tauri::command]
pub fn get_current_trace() -> String {
    uuid::Uuid::new_v4().to_string()
}
