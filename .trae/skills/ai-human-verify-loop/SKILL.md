---
name: "ai-human-verify-loop"
description: "生成人工页面验证闭环：AI 产出可执行 steps，经 MCP 通知人工操作并收集反馈与证据包（trace/assert/network/screenshot）。当实现需要页面手动验证或需要自反馈闭环时调用。"
---

# 人工验证闭环（ai-human-verify-loop）

## 目标

在 Trae 内形成自我反馈闭环：

AI 写完代码 → **在代码中注入运行时日志** → 生成可执行操作步骤 → 通过 MCP 推送给人工 → **阻塞等待人工完成** → 自动收集 trace bundle（含运行时日志 + 人工反馈 + 控制台错误）→ AI 根据证据包判定通过/失败并继续修复或重试。

## 适用场景（触发条件）

- 需要真实页面交互验证（点击/输入/跳转/观察结果）
- 自动化不可靠或不希望引入全自动浏览器控制
- 需要将人工观察结果结构化回传给 AI

## 日志注入（开发时必须做）

AI 在开发代码时，必须在关键路径注入运行时日志，这些日志会在浏览器执行时产生证据，验证时自动收集到 trace bundle 中。

### 从 `@xlb/utils` 导入 logger

```typescript
import { aiTrace, aiAssert, aiManualFeedback, createLogger } from '@xlb/utils';
```

### 注入追踪日志 — `aiTrace`

在关键用户操作和业务流程节点注入，记录"发生了什么"：

```typescript
import { aiTrace } from '@xlb/utils';

function handleSubmit() {
  aiTrace('checkout', 'submit_clicked', '用户点击了提交按钮');

  const result = api.submit(formData);

  aiTrace('checkout', 'api_response', `提交结果: ${result.status}`, {
    status: result.status,
    orderId: result.orderId,
    duration: result.duration,
  });
}
```

**参数说明**：
- 第 1 个参数：`module` — 模块名（如 `'checkout'`, `'login'`, `'user-profile'`）
- 第 2 个参数：`action` — 动作名（如 `'submit_clicked'`, `'api_response'`, `'page_loaded'`）
- 第 3 个参数：`message` — 人类可读描述
- 第 4 个参数（可选）：`attrs` — 结构化附加信息

### 注入断言日志 — `aiAssert`

在验证点注入，记录"是否符合预期"：

```typescript
import { aiAssert } from '@xlb/utils';

function onPageLoad() {
  const title = document.title;
  aiAssert('page', 'title_visible', title.length > 0, '标题不为空', `标题: "${title}"`);

  const submitBtn = document.querySelector('#submit-btn');
  aiAssert('page', 'submit_button_exists', !!submitBtn, '提交按钮存在', submitBtn ? '找到' : '未找到');
}

function afterApiCall(response) {
  aiAssert('api', 'status_ok', response.ok, 'HTTP 200', `HTTP ${response.status}`);
  aiAssert('api', 'has_data', !!response.data, '返回数据不为空', `data: ${JSON.stringify(response.data)?.slice(0, 100)}`);
}
```

**参数说明**：
- 第 1 个参数：`module` — 模块名
- 第 2 个 参数：`name` — 断言名称（如 `'title_visible'`, `'submit_button_exists'`）
- 第 3 个参数：`passed` — 是否通过
- 第 4 个参数（可选）：`expected` — 期望值描述
- 第 5 个参数（可选）：`actual` — 实际值描述

### 注入人工反馈日志 — `aiManualFeedback`

在需要记录人工判断结果的场景使用：

```typescript
import { aiManualFeedback } from '@xlb/utils';

function onUserFeedback(stepResult: 'ok' | 'ng') {
  if (stepResult === 'ok') {
    aiManualFeedback('checkout', 'passed');
  } else {
    aiManualFeedback('checkout', 'failed', 'click_no_response', '提交按钮点击后无响应');
  }
}
```

### 创建自定义 Logger

```typescript
import { createLogger, setLogSink } from '@xlb/utils';

const logger = createLogger({
  app: 'my-feature',
  source: 'page',
  defaultModule: 'order',
  context: {
    traceId: 'tr-123',
    taskId: 'vt-456',
  },
});

logger.info('order', 'created', '订单创建成功', { orderId: 'ORD-001', amount: 99.9 });
logger.warn('order', 'stock_low', '库存不足', { remaining: 3 });
logger.error('order', 'payment_failed', '支付失败', { code: 'E503' });

// 派生子 logger，继承上下文
const childLogger = logger.withContext({ stepId: 'step-2' });
childLogger.trace('order', 'step_executing', '执行步骤2');
```

### 日志流向（自动完成，无需手动处理）

```
代码中 aiTrace/aiAssert/aiManualFeedback
  → @xlb/utils logger（运行时）
  → setLogSink（由插件 Background 自动安装）
  → Bridge WebSocket → SQLite (~/.wujie/wujie_bridge.db)

验证时 trace bundle 自动包含所有 log_events
```

## MCP 工具总览

### 运行时日志工具（代码注入用）

AI 在写代码时使用这些 API，浏览器运行时产生日志：

| API | 导入 | 说明 |
|---|---|---|
| `aiTrace` | `@xlb/utils` | 追踪日志：记录"发生了什么" |
| `aiAssert` | `@xlb/utils` | 断言日志：记录"是否符合预期" |
| `aiManualFeedback` | `@xlb/utils` | 人工反馈日志 |
| `createLogger` | `@xlb/utils` | 创建自定义 logger |

### MCP 工具（AI 直接调用）

| 工具名 | 说明 |
|---|---|
| `validation_request_human_action` | 推送验证任务并阻塞等待结果（主入口） |
| `validation_collect_trace_bundle` | 手动收集某个 task 的已有反馈（兜底用） |
| `log_write` | AI 直接写日志到 Bridge（记录 AI 自身操作） |
| `log_assert` | AI 直接写断言到 Bridge（记录 AI 判定） |
| `log_query` | 查询 Bridge 中的日志（按 taskId/traceId/level） |

## 完整工作流

### 第一步：开发代码时注入日志

AI 写代码时，在关键路径注入 `aiTrace` 和 `aiAssert`：

```typescript
import { aiTrace, aiAssert } from '@xlb/utils';

// 页面加载时
aiTrace('feature-x', 'page_loaded', '功能X页面已加载');
aiAssert('feature-x', 'title_visible', document.title.length > 0, '标题不为空', document.title);

// 用户操作时
aiTrace('feature-x', 'button_clicked', '用户点击了提交按钮');
const result = await submitForm(data);
aiAssert('feature-x', 'submit_success', result.success, '提交成功', `结果: ${result.message}`);
```

### 第二步：推送验证任务（阻塞等待）

AI 调用 `validation_request_human_action`：

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

工具会**阻塞等待**直到人工完成。

### 第三步：分析 trace bundle

返回的 trace bundle 包含三部分证据：

```json
{
  "status": "completed",
  "task_id": "vt_xxx",
  "bundle": {
    "feedback": [
      { "step_id": "s1", "result": "passed" },
      { "step_id": "s2", "result": "failed", "comment": "点击无反应" }
    ],
    "console_errors": [
      { "message": "TypeError: ...", "url": "https://..." }
    ],
    "log_events": [
      { "module": "feature-x", "action": "page_loaded", "message": "功能X页面已加载", "kind": "ai_trace" },
      { "module": "feature-x", "action": "title_visible", "message": "assert passed", "kind": "ai_assert" },
      { "module": "feature-x", "action": "button_clicked", "message": "用户点击了提交按钮", "kind": "ai_trace" },
      { "module": "feature-x", "action": "submit_success", "message": "assert failed", "kind": "ai_assert", "attrs": "{\"assert\":{\"passed\":false,\"expected\":\"提交成功\",\"actual\":\"结果: 网络错误\"}}" }
    ]
  }
}
```

### 第四步：AI 判定并输出报告

AI 综合分析三部分证据：

1. **feedback**：人工操作结果（passed/failed）
2. **console_errors**：浏览器控制台错误
3. **log_events**：代码运行时产生的日志和断言

判定：
- 全部 passed + 无 console errors + 所有 aiAssert passed → ✅ 验证通过
- 有 failed → 定位失败步骤，结合 log_events 和 console_errors 分析根因，提出修复方案
- 有 suspended → 询问用户是否继续

## AI 行为检查清单

开发代码时：
- [ ] 已在关键用户操作路径注入 `aiTrace`
- [ ] 已在验证点注入 `aiAssert`（expected vs actual）
- [ ] 已在代码顶部 `import { aiTrace, aiAssert } from '@xlb/utils'`

验证时：
- [ ] 已调用 `validation_request_human_action` 推送任务
- [ ] 已告知用户去 SidePanel 操作
- [ ] 已分析 trace bundle 中的 feedback、console_errors、log_events
- [ ] 已输出结构化的验证结论

## 异常兜底

- **超时**：5 分钟未完成自动返回 `{ status: "timeout" }`，AI 可用 `validation_collect_trace_bundle` 收集已有结果
- **挂起**：人工点击"挂起"返回 `{ status: "suspended" }`，AI 应询问用户是否继续
- **插件断连**：WS 错误导致 reject，AI 应提示用户检查插件和 Bridge 连接
- **console_errors 相关性**：AI 应判断错误是否与当前验证页面相关，过滤无关错误
- **log_events 中 ai_assert failed**：AI 应关注 failed 的断言，结合 expected/actual 分析根因
