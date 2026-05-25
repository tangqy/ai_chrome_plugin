---
name: "ai-human-verify-loop"
description: "生成人工页面验证闭环：AI 产出可执行 steps，经 MCP 通知人工操作并收集反馈与证据包（trace/assert/network/screenshot）。当实现需要页面手动验证或需要自反馈闭环时调用。"
---

# 人工验证闭环（ai-human-verify-loop）

## 目标

在 Trae 内形成自我反馈闭环：

AI 写完代码 → 生成可执行操作步骤 → 通过 MCP 推送给人工 → **阻塞等待人工完成** → 自动收集 trace bundle → AI 根据证据包判定通过/失败并继续修复或重试。

## 适用场景（触发条件）

- 需要真实页面交互验证（点击/输入/跳转/观察结果）
- 自动化不可靠或不希望引入全自动浏览器控制
- 需要将人工观察结果结构化回传给 AI

## 调用方式（一次调用，自动闭环）

AI 只需调用一次 `validation_request_human_action`，该工具会：

1. 将任务推送到插件 SidePanel
2. **阻塞等待**人工操作完成（最长 5 分钟）
3. 人工点击"验证完毕"后，自动收集 trace bundle
4. 返回完整的验证结果

### 输入

```json
{
  "task": {
    "task_id": "vt_xxx",
    "trace_id": "tr_xxx",
    "title": "验证 XXX 功能",
    "steps": [
      { "step_id": "s1", "typ": "observe", "instruction": "查看页面标题", "expected": "标题正常显示" },
      { "step_id": "s2", "typ": "click", "instruction": "点击提交按钮", "expected": "提交成功" }
    ]
  }
}
```

### 返回结构

```json
{
  "status": "completed",
  "task_id": "vt_xxx",
  "trace_id": "tr_xxx",
  "bundle": {
    "task_id": "vt_xxx",
    "ts": 1779713490802,
    "feedback": [
      { "step_id": "s1", "result": "passed", "comment": null, "ts": 1779713434128 },
      { "step_id": "s2", "result": "failed", "exception_type": "click_no_response", "comment": "点击无反应", "ts": 1779713435227 }
    ],
    "console_errors": [
      { "message": "TypeError: ...", "url": "https://...", "tab_id": 123, "ts": 1779713430000 }
    ]
  }
}
```

### 可能的 status 值

| status | 含义 |
|---|---|
| `completed` | 人工正常完成所有步骤 |
| `suspended` | 人工点击了"挂起"（耗时较长） |
| `timeout` | 5 分钟超时，人工未完成 |

## AI 拿到结果后必须做的事

1. **检查 status**：
   - `completed` → 分析 feedback
   - `suspended` → 询问用户是否继续，可再次调用同 task_id
   - `timeout` → 提示用户超时，可用 `validation_collect_trace_bundle` 手动收集已有结果

2. **分析 feedback**：统计 passed/failed/suspended/blocked 数量

3. **分析 console_errors**：是否有与本次变更相关的错误

4. **判定**：
   - 全部 passed → 验证通过，向用户报告成功
   - 有 failed → 定位失败步骤，分析原因（结合 console_errors），提出修复方案
   - 有 suspended → 询问用户是否继续验证

5. **输出结论**：向用户展示结构化的验证报告

## 数据结构

### ValidationTask

```ts
type ValidationTask = {
  taskId: string
  traceId: string
  title: string
  steps: ValidationStep[]
}
```

### ValidationStep

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

### HumanFeedback

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

## MCP 工具

| 工具名 | 说明 |
|---|---|
| `validation_request_human_action` | 推送任务并阻塞等待结果（主入口） |
| `validation_collect_trace_bundle` | 手动收集某个 task 的已有反馈（兜底用） |

## 异常兜底

- **超时**：5 分钟未完成自动返回 `{ status: "timeout" }`，AI 可用 `validation_collect_trace_bundle` 收集已有结果
- **挂起**：人工点击"挂起"返回 `{ status: "suspended" }`，AI 应询问用户是否继续
- **插件断连**：WS 错误导致 reject，AI 应提示用户检查插件和 Bridge 连接
- **console_errors 相关性**：AI 应判断错误是否与当前验证页面相关，过滤无关错误
