---
name: "ai-human-verify-loop"
description: "生成“人工页面验证闭环”：AI 产出可执行 steps，经 MCP 通知人工操作并收集反馈与证据包（trace/assert/network/screenshot）。当实现需要页面手动验证或需要自反馈闭环时调用。"
---

# 人工验证闭环（ai-human-verify-loop）

## 目标

在 Trae 内形成自我反馈闭环：

1) AI 写完代码 → 2) 生成可执行操作步骤（steps）→ 3) 通过 MCP 推送给人工 → 4) 人工只执行与反馈 → 5) AI 根据证据包判定通过/失败并继续修复或重试。

## 适用场景（触发条件）

- 需要真实页面交互验证（点击/输入/跳转/观察结果）
- 自动化不可靠或不希望引入全自动浏览器控制
- 需要将人工观察结果结构化回传给 AI

## 输出要求

- 默认输出 unified diff（协议/消息定义、调用点、最小 UI 支持）
- token 压缩：默认只向 AI 回传摘要证据包（summary），必要时再拉 detail/full
- 异常兜底：断连/超时/证据不足/人工挂起都要有明确状态与返回结构

## 数据结构（必须）

### 1) ValidationTask

```ts
type ValidationTask = {
  taskId: string
  traceId: string
  title: string
  steps: ValidationStep[]
}
```

### 2) ValidationStep

```ts
type ValidationStep = {
  stepId: string
  type: 'navigate' | 'click' | 'input' | 'observe' | 'mock_trigger'
  instruction: string
  selectorHint?: string
  target?: string
  expected?: string
}
```

### 3) HumanFeedback

```ts
type HumanFeedback = {
  taskId: string
  stepId: string
  result: 'passed' | 'failed' | 'blocked' | 'suspended'
  exceptionType?:
    | 'element_not_found'
    | 'click_no_response'
    | 'wrong_result'
    | 'network_error'
    | 'timeout'
    | 'other'
  comment?: string
}
```

## MCP 工具契约（建议）

最小工具集（优先任务级工具，不要直接暴露一堆原子 click API）：

- `validation_create_task`
- `validation_push_steps`
- `validation_request_human_action`
- `validation_submit_human_feedback`
- `validation_collect_trace_bundle`
- `validation_mark_suspend`

## 证据包压缩（必须）

默认返回 summary：

```json
{
  "taskId": "vt_xxx",
  "traceId": "tr_xxx",
  "status": "failed",
  "failedSteps": ["s2"],
  "assertSummary": { "passed": 3, "failed": 1 },
  "manualFeedback": [{ "stepId": "s2", "exceptionType": "click_no_response", "comment": "点击无反应" }],
  "keyFindings": ["console_error: ...", "no network request observed"]
}
```

当 AI 判断证据不足时，再请求 `detail/full`。

## 异常兜底（必须）

- 插件断连：任务进入 `blocked`，返回可重试提示
- 任务超时：自动 `suspended`，保留当前证据
- 证据不足：返回 `need_more_evidence: true` 并指明需要的证据类型

## 执行步骤（你应如何工作）

1. 从用户需求与代码变更推导最少 steps（可执行、可观察）
2. steps 必须包含 `stepId`，并在日志/断言 ctx 中带上 `{ taskId, stepId, traceId }`
3. 通过 MCP 把 steps 推给人工（插件面板）
4. 收集人工反馈 + 关键证据（assert/console/network/screenshot）
5. 压缩成 summary 返给 AI；必要时再拉 detail/full

