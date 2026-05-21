use serde::{Deserialize, Serialize};

pub static TRACE_ID_HEADER: &str = "X-Trace-Id";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceContext {
    pub trace_id: String,
    pub span_id: Option<String>,
    pub parent_trace_id: Option<String>,
}

impl TraceContext {
    pub fn new() -> Self {
        let trace_id = uuid::Uuid::new_v4().to_string();
        
        TraceContext {
            trace_id,
            span_id: None,
            parent_trace_id: None,
        }
    }
    
    pub fn from_header(trace_id: String) -> Self {
        TraceContext {
            trace_id,
            span_id: None,
            parent_trace_id: None,
        }
    }
    
    pub fn with_span_id(mut self, span_id: String) -> Self {
        self.span_id = Some(span_id);
        self
    }
    
    pub fn with_parent(mut self, parent_trace_id: String) -> Self {
        self.parent_trace_id = Some(parent_trace_id);
        self
    }
}

pub fn extract_trace_context(headers: &[(String, String)]) -> TraceContext {
    headers
        .iter()
        .find(|(k, _)| k.to_lowercase() == "x-trace-id")
        .map(|(_, v)| TraceContext::from_header(v.clone()))
        .unwrap_or_else(TraceContext::new)
}

pub fn inject_trace_context() -> Vec<(String, String)> {
    let trace_id = uuid::Uuid::new_v4().to_string();
    vec![(TRACE_ID_HEADER.to_string(), trace_id)]
}
