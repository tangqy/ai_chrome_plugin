use rusqlite::{Connection, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tracing::{error, info};

#[derive(Debug, Serialize, Deserialize)]
pub struct AppLog {
    pub id: i64,
    pub trace_id: String,
    pub level: String,
    pub message: String,
    pub timestamp: String,
    pub source: String,
}

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(app_data_dir: PathBuf) -> SqliteResult<Self> {
        std::fs::create_dir_all(&app_data_dir).ok();
        let db_path = app_data_dir.join("wujie_gui.db");
        
        info!("Initializing database at: {:?}", db_path);
        
        let conn = Connection::open(&db_path)?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trace_id TEXT NOT NULL,
                level TEXT NOT NULL,
                message TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                source TEXT DEFAULT 'app'
            )",
            [],
        )?;
        
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_logs_trace_id ON logs(trace_id)",
            [],
        )?;
        
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp)",
            [],
        )?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS git_repos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                last_opened TEXT,
                created_at TEXT NOT NULL
            )",
            [],
        )?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS app_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )?;
        
        info!("Database initialized successfully");
        
        Ok(Database {
            conn: Mutex::new(conn),
        })
    }
    
    pub fn log(&self, trace_id: &str, level: &str, message: &str, source: &str) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        let timestamp = chrono::Utc::now().to_rfc3339();
        
        conn.execute(
            "INSERT INTO logs (trace_id, level, message, timestamp, source) VALUES (?1, ?2, ?3, ?4, ?5)",
            [trace_id, level, message, &timestamp, source],
        )?;
        
        Ok(())
    }
    
    pub fn get_logs(&self, limit: i64) -> SqliteResult<Vec<AppLog>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, trace_id, level, message, timestamp, source 
             FROM logs 
             ORDER BY timestamp DESC 
             LIMIT ?1"
        )?;
        
        let logs = stmt.query_map([limit], |row| {
            Ok(AppLog {
                id: row.get(0)?,
                trace_id: row.get(1)?,
                level: row.get(2)?,
                message: row.get(3)?,
                timestamp: row.get(4)?,
                source: row.get(5)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
        
        Ok(logs)
    }
    
    pub fn get_logs_by_trace_id(&self, trace_id: &str) -> SqliteResult<Vec<AppLog>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, trace_id, level, message, timestamp, source 
             FROM logs 
             WHERE trace_id = ?1 
             ORDER BY timestamp ASC"
        )?;
        
        let logs = stmt.query_map([trace_id], |row| {
            Ok(AppLog {
                id: row.get(0)?,
                trace_id: row.get(1)?,
                level: row.get(2)?,
                message: row.get(3)?,
                timestamp: row.get(4)?,
                source: row.get(5)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
        
        Ok(logs)
    }
    
    pub fn save_app_state(&self, key: &str, value: &str) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        let timestamp = chrono::Utc::now().to_rfc3339();
        
        conn.execute(
            "INSERT OR REPLACE INTO app_state (key, value, updated_at) VALUES (?1, ?2, ?3)",
            [key, value, &timestamp],
        )?;
        
        Ok(())
    }
    
    pub fn get_app_state(&self, key: &str) -> SqliteResult<Option<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT value FROM app_state WHERE key = ?1")?;
        
        let result = stmt.query_row([key], |row| row.get(0)).ok();
        Ok(result)
    }
    
    pub fn cleanup_old_logs(&self, days: i64) -> SqliteResult<usize> {
        let conn = self.conn.lock().unwrap();
        let cutoff = chrono::Utc::now() - chrono::Duration::days(days);
        let cutoff_str = cutoff.to_rfc3339();
        
        let deleted = conn.execute(
            "DELETE FROM logs WHERE timestamp < ?1",
            [&cutoff_str],
        )?;
        
        info!("Cleaned up {} old log entries", deleted);
        Ok(deleted)
    }
}
