pub mod protocol;

pub fn format_json_fast(input: &str) -> Result<String, String> {
    let value: serde_json::Value = serde_json::from_str(input).map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&value).map_err(|e| e.to_string())
}

pub fn diff_text_fast(left: &str, right: &str) -> String {
    let a: Vec<&str> = left.lines().collect();
    let b: Vec<&str> = right.lines().collect();
    let n = a.len().max(b.len());
    let mut out: Vec<String> = Vec::with_capacity(n * 2);

    for i in 0..n {
        let la = a.get(i).copied().unwrap_or("");
        let lb = b.get(i).copied().unwrap_or("");
        if la == lb {
            out.push(format!("  {}", la));
        } else {
            if !la.is_empty() {
                out.push(format!("- {}", la));
            }
            if !lb.is_empty() {
                out.push(format!("+ {}", lb));
            }
        }
    }

    out.join("\n")
}
