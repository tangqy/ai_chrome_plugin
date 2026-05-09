use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum BridgeRequest {
    #[serde(rename = "ping")]
    Ping { request_id: String },
    #[serde(rename = "sync_data")]
    SyncData {
        request_id: String,
        payload: SyncPayload,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncPayload {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum BridgeResponse {
    #[serde(rename = "pong")]
    Pong { request_id: String, ts: u64 },
    #[serde(rename = "sync_result")]
    SyncResult {
        request_id: String,
        ok: bool,
        count: u32,
    },
    #[serde(rename = "error")]
    Error {
        request_id: String,
        code: String,
        message: String,
    },
}
