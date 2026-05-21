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
    #[serde(rename = "get_console_errors")]
    GetConsoleErrors { request_id: String },
    #[serde(rename = "get_sessions")]
    GetSessions { request_id: String },
    #[serde(rename = "get_status")]
    GetStatus { request_id: String },
    #[serde(rename = "validation_request_human_action")]
    ValidationRequestHumanAction {
        request_id: String,
        payload: ValidationRequestHumanActionPayload,
    },
    #[serde(rename = "validation_collect_trace_bundle")]
    ValidationCollectTraceBundle {
        request_id: String,
        payload: ValidationCollectTraceBundlePayload,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncPayload {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsoleErrorItem {
    pub message: String,
    pub url: Option<String>,
    pub tab_id: Option<i32>,
    pub ts: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionItem {
    pub tab_id: i32,
    pub url: String,
    pub last_seen_ts: u64,
    pub error_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusItem {
    pub ts: u64,
    pub total_errors: usize,
    pub total_sessions: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HumanVerifyStep {
    pub step_id: String,
    #[serde(rename = "type")]
    pub typ: String,
    pub instruction: String,
    pub expected: Option<String>,
    pub selector_hint: Option<String>,
    pub target: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HumanVerifyTask {
    pub task_id: String,
    pub trace_id: String,
    pub title: String,
    pub steps: Vec<HumanVerifyStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationRequestHumanActionPayload {
    pub task: HumanVerifyTask,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationCollectTraceBundlePayload {
    pub task_id: String,
    pub level: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HumanFeedbackItem {
    pub task_id: String,
    pub trace_id: String,
    pub step_id: String,
    pub result: String,
    pub exception_type: Option<String>,
    pub comment: Option<String>,
    pub ts: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceBundleSummary {
    pub task_id: String,
    pub ts: u64,
    pub feedback: Vec<HumanFeedbackItem>,
    pub console_errors: Vec<ConsoleErrorItem>,
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
    #[serde(rename = "console_errors")]
    ConsoleErrors {
        request_id: String,
        count: usize,
        items: Vec<ConsoleErrorItem>,
    },
    #[serde(rename = "sessions")]
    Sessions {
        request_id: String,
        count: usize,
        items: Vec<SessionItem>,
    },
    #[serde(rename = "status")]
    Status {
        request_id: String,
        status: StatusItem,
    },
    #[serde(rename = "validation_request_human_action_result")]
    ValidationRequestHumanActionResult { request_id: String, ok: bool },
    #[serde(rename = "validation_collect_trace_bundle_result")]
    ValidationCollectTraceBundleResult {
        request_id: String,
        ok: bool,
        bundle: TraceBundleSummary,
    },
    #[serde(rename = "error")]
    Error {
        request_id: String,
        code: String,
        message: String,
    },
}
