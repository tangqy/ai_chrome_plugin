# Wujie AI Sensing Monorepo

基于 **React + Rust + pnpm + WXT + Vite 8** 的无界前端 AI 感知系统。

## 技术栈

- 前端插件：React + Ant Design + WXT + Vite 8
- 本地桥接：Rust（MCP/stdio + WebSocket）
- 共享逻辑：Rust shared crate + TypeScript protocol package
- 工程管理：pnpm workspace（Monorepo）

## 目录结构

- `apps/plugin`：Chrome 插件（WXT）
- `crates/rust-bridge`：本地 bridge 服务（Rust）
- `crates/rust-shared`：Rust 共享协议和逻辑
- `packages/protocol-ts`：TS 协议定义
- `docs/trae-mcp.config.example.json`：Trae MCP 配置示例

## 插件前端模块划分

Popup 采用分模块组织，避免单文件过大（核心文件控制在 300 行以内）：

- `popup/main.tsx`：页面组装与跨 tab 状态编排
- `popup/tabs/ObserveTab.tsx`：观测面板（连接状态、错误日志、会话）
- `popup/tabs/SyncTab.tsx`：域名同步面板
- `popup/tabs/ToolboxTab.tsx`：工具箱入口（折叠分组）
- `popup/components/toolbox/TextToolsSection.tsx`：Unicode / JSON
- `popup/components/toolbox/DiffSection.tsx`：Git 风格 Diff
- `popup/components/toolbox/UtilitySection.tsx`：二维码 / 时间 / 代理 / Network
- `popup/components/toolbox/AutomationSection.tsx`：Cron 自动化

Background 也已模块化拆分：

- `background/index.ts`：消息分发和主流程
- `background/bridge.ts`：bridge 连接与转发
- `background/network.ts`：network 录制管理
- `background/cron.ts`：自动化任务调度
- `background/operations.ts`：业务操作函数集合
- `background/state.ts`：运行时状态

## 快速开始

```bash
pnpm install
pnpm dev
```

另开一个终端启动 bridge：

```bash
cargo run -p rust-bridge
```

## 验证命令

```bash
pnpm -r typecheck
pnpm --filter @wujie/plugin build
cargo check
```

## 功能验证步骤

### 1) 基础链路验证（Bridge + 插件）

1. 启动 bridge：`cargo run -p rust-bridge`
2. 启动插件开发：`pnpm --filter @wujie/plugin dev`
3. 在 Chrome 扩展页重载插件
4. 打开任意 `http/https` 页面执行：
   - `console.error('bridge test', Date.now())`
5. 打开插件 `观测面板`，确认：
   - `WS Connected` 为 `Connected`
   - `Latest Errors` 出现新增日志
   - `Bridge Sessions` 出现当前 tab 会话

### 2) 同步数据验证（源域名 -> 当前页面）

1. 同时打开两个页面：
   - 源页面：域名包含输入的 `sourceDomain`（例如 `react_web`）
   - 目标页面：当前激活 tab（写入目标）
2. 在 `同步数据` Tab 输入源域名，点击 `同步源域名数据到当前页面`
3. 预期：
   - `localStorage Keys` 显示同步键数量
   - `Cookies Copied` 显示复制 cookie 数量
   - `Failed` 为 0 或较小（受浏览器策略影响）

### 3) 工具箱验证

工具箱采用按需折叠分组展示，避免大段罗列。

1. 文本工具（Unicode / JSON）
   - 输入 `\\u4f60\\u597d`，转换后应为 `你好`
   - JSON 输入合法时输出格式化结果，非法时提示错误

2. Diff 对比（Git 风格）
   - 左右输入不同文本，点击 `执行 Diff`
   - 结果区域应有 `+/-` 高亮行

3. 实用工具
   - 二维码：输入 URL 后展示二维码
   - 时间：可获取当前时间戳并互转
   - 代理：可切换 `系统代理 / 直连`
   - Network：可开关录制并导出 cURL

4. 自动化任务（Cron + JS）
   - 示例：`*/1 * * * *` + `return 'ok';`
   - 预期任务列表出现 `lastRunAt` 和 `lastResult`

### 4) Network 录制导出 cURL 验证

1. 在工具箱开启 `Network 录制`
2. 在当前页面执行若干 XHR/fetch 或刷新触发请求
3. 点击 `导出为 cURL`
4. 预期输出包含可执行 cURL 命令（多条请求逐条输出）

## Stdio MCP 示例（可直接复制）

先启动 bridge：

```bash
cargo run -p rust-bridge
```

向 bridge 的 stdin 输入 JSON 行：

```json
{"type":"ping","request_id":"req-1"}
{"type":"get_sessions","request_id":"req-2"}
{"type":"get_console_errors","request_id":"req-3"}
{"type":"get_status","request_id":"req-4"}
{"type":"sync_data","request_id":"req-5","payload":{"key":"demo_key","value":"demo_value"}}
```

预期响应类型：
- `pong`
- `sessions`
- `console_errors`
- `status`
- `sync_result`
- `error`（输入非法时）

## 自然语言调用（轻量映射）

bridge 支持自然语言兜底，不强依赖 LLM：

- `勇哥，帮我获取当前控制台日志`
- `勇哥，查看当前会话`
- `勇哥，查询状态`
- `勇哥，做一次连通性 ping`
- `勇哥，同步 key=foo value=bar`

说明：
- 自然语言会被映射到 `get_console_errors/get_sessions/get_status/ping/sync_data`
- `sync_data` 支持轻量参数语法：`key=xxx value=yyy`
- 缺省参数：`wujie-ai-sync-key / demo-value`

## Trae 中接入 MCP

示例配置文件：`docs/trae-mcp.config.example.json`

```json
{
  "mcpServers": {
    "wujie-bridge": {
      "command": "cargo",
      "args": ["run", "-p", "rust-bridge"],
      "cwd": "/Users/tqy/private/ai_test/ai_chrome_plugin"
    }
  }
}
```

接入步骤：

1. 打开 Trae 的 MCP 设置
2. 新增 stdio MCP Server，名称 `wujie-bridge`
3. 填入 `command/args/cwd`
4. 保存并重载 MCP Server
5. 在 Trae 中发送测试：
   - `{"type":"ping","request_id":"req-ping"}`
   - `{"type":"get_status","request_id":"req-status"}`

若 `get_status` 返回 `total_sessions` 与 `total_errors`，表示接入成功。

## 常见问题

- `bridge 无输出`
  - 先确认你是在 `http/https` 页面触发 `console.error`，不是浏览器内部页
  - 再确认插件已重载，且 popup 显示 `WS Connected`

- CSP 报错 `page-hook.js` 无法加载
  - 确认该文件已在 `web_accessible_resources` 中配置

- `WS disconnected`
  - 确认 `cargo run -p rust-bridge` 进程仍在运行

- `cargo command not found`（Trae 内）
  - 确认 Trae 使用的 shell 环境包含 Rust 工具链路径


补充：Diff 支持选择两个本地文件并进行高亮对比。


补充：Network 日志中心支持筛选请求并复制单条 cURL，仍支持批量导出。


### 5) Mock 请求功能验证

1. 打开 `Mock 请求` Tab，新增规则：
   - URL 匹配：`/api/test`
   - Method：`GET`
   - 状态码：`200`
   - 脚本：`return { code: 0, data: { now: context.now } };`
2. 在当前页面控制台执行：`fetch('/api/test').then(r => r.json()).then(console.log)`
3. 预期返回脚本生成的数据。
4. 如需第三方模块，在“第三方模块”中每行填写：`dayjs@https://esm.sh/dayjs`，脚本可通过 `imports.dayjs` 使用。

## Mock 高占比场景增强验证（cURL + 响应改写）

1. cURL 导入
- 打开 `Mock 请求` Tab。
- 粘贴 cURL，点击 `解析 cURL 并带入草稿`。
- 预期：`method + pathPattern + headerMatch` 自动填充。

2. 从 Network 日志一键生成 Mock
- 在工具箱开启 Network 录制并触发请求。
- 在 `Network 日志中心` 点击某条请求的 `生成Mock`。
- 预期：Mock Tab 自动带入对应草稿。

3. 响应体复制与改写
- 在 Mock Tab 选择 `fixed` 模式。
- 将真实响应 JSON 粘贴到 `responseBodyRaw`，修改字段后保存。
- 访问目标请求，预期返回修改后的响应。

4. Header / Referer 改写
- 在 `Referer（快捷）` 填值，或在 `requestHeaderPatch JSON` 配置 header。
- 保存规则后触发请求，预期请求上下文按规则覆盖。
- 在 `responseHeaders JSON` 设置自定义响应头，预期响应可见。

5. 模式验证
- `mockjs` 模式：填写 MockJS 模板，点击预览和请求验证。
- `script` 模式：填写脚本与 imports（白名单域名），请求时动态生成。
