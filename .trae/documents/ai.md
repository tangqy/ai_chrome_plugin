以下是结合当前仓库实现形态的**方案设计（更新版）**，用于在 Trae 内借助插件 MCP 能力形成“自我反馈闭环”。

---

# 技术方案：Trae + 插件 MCP 的自我反馈闭环

## 1. 目标

在 Trae 的开发工作流中，实现闭环：

**AI 写代码（自动打桩） → 人工按步骤验证页面 → 证据包压缩回传 → AI Review/修复/重试**

核心输出不是“自动化浏览器控制”，而是“标准化人工验证 + 可压缩证据包”，让 AI 能稳定自反馈。

## 2. 核心原则

- 人只做“手和眼睛”：执行、观察、标记异常，不分析代码
- AI 主导：生成步骤、定位问题、生成修复、决定是否重试/挂起
- 标准化通信：Trae 通过 MCP 调用本地服务，插件作为浏览器内执行层
- 证据先行：所有判断基于结构化 `trace/assert/manual_feedback/network/screenshot`
- token 可控：默认只回传 summary，必要时再拉取 detail/full

## 3. 架构（与当前仓库对齐）

### 3.1 总体架构

```
┌──────────────────────────┐   MCP(JSON-RPC stdio)   ┌──────────────────────────┐
│ Trae (AI / Skills)        │ ◄──────────────────────► │ 本地服务（GUI 内嵌 bridge） │
│ - ai-instrumentation      │                        │ - MCP tools               │
│ - ai-human-verify-loop    │                        │ - 任务/步骤状态机          │
└──────────────────────────┘                        │ - 证据包压缩（summary）    │
                                                     │ - SQLite 落库与查询         │
                                                     └───────────┬──────────────┘
                                                                 │ local WS
                                                                 │
                                                     ┌───────────▼──────────────┐
                                                     │ 浏览器插件（WXT）           │
                                                     │ - background: 能力代理/录制 │
                                                     │ - content: 页面注入/采集    │
                                                     │ - popup: 人工步骤面板        │
                                                     └───────────────────────────┘
```

说明：

- **本地服务**不再是 Node MCP Server，而是 **Rust bridge 融合到 GUI**：GUI 启动后内嵌 WS/MCP/SQLite/压缩器，减少进程与日志分散
- 插件侧以 **popup-first** 作为人工操作入口；DevTools panel 为后续增强

### 3.2 仓库落点映射

- 插件（WXT）：`apps/plugin`
- GUI（Tauri）：`apps/gui`
- bridge（Rust）：`crates/rust-bridge`（逐步融合进 GUI）
- 协议（TS）：`packages/protocol-ts`
- 前端日志打桩：`packages/logger-ts`（`@wujie/logger-ts`）
- Skills：
  - `.trae/skills/ai-instrumentation`
  - `.trae/skills/ai-human-verify-loop`

## 4. 关键模块设计

### 4.1 日志/断言打桩（ai-instrumentation + @wujie/logger-ts）

- 打桩库：`@wujie/logger-ts` 提供 `aiTrace / aiAssert / aiManualFeedback`
- 打桩粒度（默认关键路径）：
  - 组件初始化（加载开始/结束）
  - 提交接口（请求发起/成功/失败）
  - 读取状态（storage/query/bridge）
  - 状态回显（UI 结果/禁用态/toast）
- 约定：
  - `traceId` 必须贯穿；前后端请求头携带 `traceId`
  - `taskId/stepId` 由验证任务系统生成并注入（logger 不自动生成 stepId）

### 4.2 人工验证闭环（ai-human-verify-loop）

- AI 输出结构化 steps（带 stepId），通过 MCP 推送给插件面板
- 人工面板提供：
  - 步骤列表（待执行/进行中/完成/异常/挂起）
  - 异常快捷上报（click_no_response / element_not_found / wrong_result / network_error / timeout）
  - 完成提交（附带必要证据）

### 4.3 证据采集与回放

- 采集源：
  - `aiTrace/aiAssert/aiManualFeedback`（业务/插件/GUI 统一入口）
  - console error / network recording（插件 background）
  - screenshot（插件或 GUI）
- 落库：
  - SQLite 作为本地证据库
  - 主索引：`taskId + stepId + traceId`

### 4.4 证据包压缩（token 控制）

压缩等级：

- `summary`（默认）：失败步骤、断言统计、关键发现、人工备注
- `detail`：失败步骤前后关键日志 + 相关 network/console + 截图引用
- `full`：完整事件流（仅在 AI 主动拉取时使用）

## 5. MCP 工具（任务级）

优先定义“验证任务级工具”，避免暴露大量原子 click API：

| 工具名称 | 功能 |
|---------|------|
| `validation_create_task` | 创建验证任务（taskId/traceId/title） |
| `validation_push_steps` | 推送步骤（steps） |
| `validation_request_human_action` | 通知插件面板开始执行某任务 |
| `validation_submit_human_feedback` | 提交人工反馈（含异常类型/备注） |
| `validation_collect_trace_bundle` | 拉取证据包（summary/detail/full） |
| `validation_mark_suspend` | 挂起任务并持久化状态 |

## 6. 闭环流程（推荐）

1. 用户在 Trae 提交需求，AI 生成/修改代码
2. 调用 `ai-instrumentation`：在关键点位插入 `@wujie/logger-ts` 打桩
3. AI 判断需要页面验证，调用 `validation_create_task` + `validation_push_steps`
4. AI 调用 `validation_request_human_action` 推送步骤给插件面板
5. 人工按步骤操作，遇到异常用快捷按钮上报；完成后提交反馈
6. AI 拉取 `validation_collect_trace_bundle(level=summary)`，判定通过/失败
7. 若失败：AI 输出 unified diff 修复；必要时仅重跑失败步骤
8. 若断连/超时/证据不足：进入兜底（挂起/重试/二次拉取 detail/full）

## 7. 技术选型（按当前仓库）

| 组件 | 技术 |
|------|------|
| 插件 | WXT + React 18 + Ant Design |
| 本地服务（MCP/WS/压缩/存储） | Rust（tokio）+ SQLite |
| GUI | Tauri（Rust 后端 + React 前端） |
| 结构化日志打桩 | `@wujie/logger-ts` |
| Skills | `ai-instrumentation` / `ai-human-verify-loop` |

## 8. 运行形态与安全

- 运行形态（目标）：只启动 GUI（内嵌 bridge）+ 插件；Trae 通过 MCP 连接 GUI
- 网络：所有交互走本地（127.0.0.1）
- 安全：
  - 日志脱敏；默认 summary 回传，避免泄露大字段
  - 打桩与 mock 仅在开发环境开启（logger 具备 enabled/level 开关）

## 9. 迭代规划（与落地顺序绑定）

| 阶段 | 内容 |
|------|------|
| MVP-1 | logger-ts + ai-instrumentation 打桩规范落地；traceId 贯通 |
| MVP-2 | ai-human-verify-loop：steps 推送/人工反馈/证据采集；summary 压缩 |
| MVP-3 | GUI 吸收 rust-bridge：统一 MCP/WS/SQLite；任务回放 UI |
| MVP-4 | detail/full 证据包、devtools panel、可选 OTel exporter |

---

本方案以“任务级工具 + 结构化证据 + token 可控压缩”为核心，把人工验证变成可重复、可回放、可被 AI 消化的输入，从而形成稳定的自我反馈闭环。
