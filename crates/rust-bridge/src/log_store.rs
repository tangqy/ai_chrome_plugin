use std::sync::Mutex;

use rusqlite::{params, Connection};
use rust_shared::protocol::LogEventItem;

pub struct LogStore {
    conn: Mutex<Connection>,
}

impl LogStore {
    pub fn new() -> anyhow::Result<Self> {
        let db_dir = dirs_data_dir();
        std::fs::create_dir_all(&db_dir).ok();
        let db_path = db_dir.join("wujie_bridge.db");
        let conn = Connection::open(&db_path)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS log_events (
                id TEXT PRIMARY KEY,
                trace_id TEXT NOT NULL,
                task_id TEXT,
                step_id TEXT,
                source TEXT NOT NULL DEFAULT 'unknown',
                module TEXT NOT NULL DEFAULT 'app',
                kind TEXT NOT NULL DEFAULT 'custom',
                level TEXT NOT NULL DEFAULT 'info',
                action TEXT NOT NULL DEFAULT '',
                message TEXT NOT NULL DEFAULT '',
                ts INTEGER NOT NULL,
                attrs TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_log_events_task_id ON log_events(task_id);
            CREATE INDEX IF NOT EXISTS idx_log_events_trace_id ON log_events(trace_id);
            CREATE INDEX IF NOT EXISTS idx_log_events_ts ON log_events(ts);",
        )?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn insert(&self, event: &LogEventItem) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO log_events (id, trace_id, task_id, step_id, source, module, kind, level, action, message, ts, attrs)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                event.id,
                event.trace_id,
                event.task_id,
                event.step_id,
                event.source,
                event.module,
                event.kind,
                event.level,
                event.action,
                event.message,
                event.ts as i64,
                event.attrs,
            ],
        )?;
        Ok(())
    }

    pub fn query_by_task_id(&self, task_id: &str, limit: usize) -> Vec<LogEventItem> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = match conn.prepare(
            "SELECT id, trace_id, task_id, step_id, source, module, kind, level, action, message, ts, attrs
             FROM log_events WHERE task_id = ?1 ORDER BY ts ASC LIMIT ?2",
        ) {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };
        let rows = stmt.query_map(params![task_id, limit as i64], |row| {
            Ok(LogEventItem {
                id: row.get(0)?,
                trace_id: row.get(1)?,
                task_id: row.get(2)?,
                step_id: row.get(3)?,
                source: row.get(4)?,
                module: row.get(5)?,
                kind: row.get(6)?,
                level: row.get(7)?,
                action: row.get(8)?,
                message: row.get(9)?,
                ts: row.get::<_, i64>(10)? as u64,
                attrs: row.get(11)?,
            })
        });
        match rows {
            Ok(r) => r.filter_map(|v| v.ok()).collect(),
            Err(_) => Vec::new(),
        }
    }

    pub fn cleanup_old(&self, days: u32) -> anyhow::Result<usize> {
        let conn = self.conn.lock().unwrap();
        let cutoff = (now_ms() / 1000) as i64 - (days as i64 * 86400);
        let cutoff_ms = cutoff * 1000;
        let count = conn.execute(
            "DELETE FROM log_events WHERE ts < ?1",
            params![cutoff_ms],
        )?;
        Ok(count)
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn dirs_data_dir() -> std::path::PathBuf {
    if cfg!(target_os = "macos") {
        std::path::PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| ".".into()))
            .join(".wujie")
    } else if cfg!(target_os = "linux") {
        let xdg = std::env::var("XDG_DATA_HOME").unwrap_or_else(|_| {
            format!(
                "{}/.local/share",
                std::env::var("HOME").unwrap_or_else(|_| ".".into())
            )
        });
        std::path::PathBuf::from(xdg).join("wujie")
    } else {
        std::path::PathBuf::from(".")
    }
}

pub type SharedLogStore = std::sync::Arc<LogStore>;
