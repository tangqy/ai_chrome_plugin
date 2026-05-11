use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsoleErrorEvent {
    pub message: String,
    pub url: Option<String>,
    pub tab_id: Option<i32>,
    pub ts: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub tab_id: i32,
    pub url: String,
    pub last_seen_ts: u64,
    pub error_count: u64,
}

pub type SharedErrors = Arc<Mutex<Vec<ConsoleErrorEvent>>>;
pub type SharedSessions = Arc<Mutex<HashMap<i32, SessionInfo>>>;
pub type SharedPrintHash = Arc<Mutex<String>>;

