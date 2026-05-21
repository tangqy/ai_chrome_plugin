---
name: "ai-instrumentation"
description: "为前端/插件代码自动注入结构化日志与断言（@wujie/logger-ts）。当你在 Trae 中实现涉及状态/请求/交互的功能、需要可验证证据或自反馈闭环时调用。"
---

# AI 打桩注入（ai-instrumentation）

## 目标

把“可观测性”变成默认能力：在关键点位自动插入 `@wujie/logger-ts` 的 `aiTrace/aiAssert/aiManualFeedback`，让后续人工验证与 AI 自反馈有稳定证据来源。

## 适用场景（触发条件）

- 修改或新增：页面交互、表单提交、网络请求、异步状态、渲染回显
- 需要人工页面验证闭环，或预计会出现“看起来对但跑不通”的风险
- 需要在 GUI/bridge/插件侧收集可结构化检索的 trace/assert 证据

## 输出要求

- 默认输出 **unified diff**，可直接应用到工作区
- 除非用户要求，不创建新文件；优先就近落点复用同目录工具
- 不要顺手改无关旧逻辑

## 打桩规范（强制）

### 1) 统一导入

在需要打桩的文件顶部添加（若已存在则复用）：

```ts
import { aiTrace, aiAssert, aiManualFeedback } from '@wujie/logger-ts'
```

### 2) 关键点位（默认粒度：关键路径）

必须覆盖四类点位：

1. **组件初始化**：首屏渲染完成、关键数据加载开始/结束
2. **提交接口**：请求发起前、响应成功/失败
3. **读取状态**：从 storage/query/bridge 获取状态时
4. **状态回显**：UI 显示关键结果时（例如 toast、列表渲染、按钮禁用态）

### 3) 推荐事件格式

- `module`：固定为业务域（如 `checkout` / `login` / `bridge` / `popup`）
- `action`：动宾短语（如 `click_submit` / `request_start` / `request_ok`）
- `message`：可为空；需要时保持短句，不要堆长文本
- `attrs`：只放关键字段（id/状态码/分支名/按钮 disabled 等），禁止塞大对象

### 4) 断言（aiAssert）

- 用于明确“预期不变量”：
  - 请求成功必须返回某字段
  - UI 必须进入某状态（例如 loading 结束）
  - 分支逻辑必须满足某条件

示例：

```ts
aiAssert('checkout', 'submit_enabled', !disabled, true, !disabled, { taskId, stepId })
```

### 5) 人工反馈（aiManualFeedback）

此函数通常由插件面板/人工步骤提交时调用；业务代码里只在确实需要时使用。

## stepId/taskId/traceId 约定

- 本技能 **不负责自动生成** `taskId/stepId`（由上层验证任务系统/插件面板提供）
- 在能拿到验证上下文时，优先把 `{ taskId, stepId, traceId }` 作为第 5 个参数传入

## 执行步骤（你应如何工作）

1. 扫描本次改动涉及的关键路径（初始化/提交/读取/回显）
2. 在最少点位插入 `aiTrace`
3. 在关键不变量处插入 `aiAssert`
4. 避免引入深层 if/loop；必要时抽到同目录 `utils.ts`
5. 输出 unified diff

