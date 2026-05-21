use std::collections::HashMap;
use std::sync::Arc;

use rust_shared::protocol::HumanFeedbackItem;
use tokio::sync::Mutex;

pub type SharedHumanFeedback = Arc<Mutex<HashMap<String, Vec<HumanFeedbackItem>>>>;

pub async fn push_feedback(store: &SharedHumanFeedback, feedback: HumanFeedbackItem) {
    let mut guard = store.lock().await;
    let entry = guard
        .entry(feedback.task_id.clone())
        .or_insert_with(Vec::new);
    entry.push(feedback);
    if entry.len() > 200 {
        let overflow = entry.len() - 200;
        entry.drain(0..overflow);
    }
}

pub async fn get_feedback(store: &SharedHumanFeedback, task_id: &str) -> Vec<HumanFeedbackItem> {
    let guard = store.lock().await;
    guard.get(task_id).cloned().unwrap_or_default()
}
