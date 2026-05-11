use rust_shared::protocol::{BridgeRequest, SyncPayload};

pub fn parse_natural_language(line: &str, request_id: String) -> Option<BridgeRequest> {
    let normalized = normalize(line);

    if contains_any(&normalized, &["ping", "连通", "心跳"]) {
        return Some(BridgeRequest::Ping { request_id });
    }
    if contains_any(&normalized, &["控制台", "console", "日志"]) {
        return Some(BridgeRequest::GetConsoleErrors { request_id });
    }
    if contains_any(&normalized, &["会话", "session", "tab"]) {
        return Some(BridgeRequest::GetSessions { request_id });
    }
    if contains_any(&normalized, &["状态", "status", "健康"]) {
        return Some(BridgeRequest::GetStatus { request_id });
    }
    if contains_any(&normalized, &["同步", "sync"]) {
        let key = extract_param(&normalized, &["key=", "键="]).unwrap_or("wujie-ai-sync-key".to_string());
        let value =
            extract_param(&normalized, &["value=", "值="]).unwrap_or("demo-value".to_string());
        return Some(BridgeRequest::SyncData {
            request_id,
            payload: SyncPayload { key, value },
        });
    }

    None
}

fn normalize(input: &str) -> String {
    input
        .trim()
        .replace('，', " ")
        .replace(',', " ")
        .replace('。', " ")
        .replace('：', ":")
        .replace('\n', " ")
        .to_lowercase()
}

fn contains_any(s: &str, patterns: &[&str]) -> bool {
    patterns.iter().any(|p| s.contains(p))
}

fn extract_param(s: &str, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(start) = s.find(key) {
            let remain = &s[start + key.len()..];
            let token = remain
                .split_whitespace()
                .next()
                .unwrap_or("")
                .trim()
                .trim_matches('"')
                .trim_matches('\'');
            if !token.is_empty() {
                return Some(token.to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::parse_natural_language;
    use rust_shared::protocol::BridgeRequest;

    #[test]
    fn parse_console_logs() {
        let req = parse_natural_language("勇哥，帮我获取当前控制台日志", "r1".to_string())
            .expect("should parse");
        match req {
            BridgeRequest::GetConsoleErrors { .. } => {}
            _ => panic!("unexpected request"),
        }
    }

    #[test]
    fn parse_status() {
        let req = parse_natural_language("查询当前状态", "r2".to_string()).expect("should parse");
        match req {
            BridgeRequest::GetStatus { .. } => {}
            _ => panic!("unexpected request"),
        }
    }

    #[test]
    fn parse_sync_with_params() {
        let req = parse_natural_language("同步 key=foo value=bar", "r3".to_string())
            .expect("should parse");
        match req {
            BridgeRequest::SyncData { payload, .. } => {
                assert_eq!(payload.key, "foo");
                assert_eq!(payload.value, "bar");
            }
            _ => panic!("unexpected request"),
        }
    }
}

