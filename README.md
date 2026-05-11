# Wujie AI Sensing Monorepo

技术栈：
- React
- Rust
- pnpm workspace
- WXT
- Vite 8（由 WXT 驱动）

## 目录结构

- `apps/plugin`：基于 WXT + React 的 Chrome 插件。
- `crates/rust-bridge`：Rust MCP 本地桥接服务（二进制）。
- `crates/rust-shared`：Rust 共享协议库。
- `packages/protocol-ts`：TypeScript 协议定义。

## 快速开始

```bash
pnpm install
pnpm dev
```

在另一个终端运行：

```bash
cargo run -p rust-bridge
```

## 验证

```bash
pnpm -r typecheck
cargo check
```

## 功能验证步骤

### 1) 基础链路验证（Bridge + 插件）

1. 启动 bridge：`cargo run -p rust-bridge`
2. 启动插件开发：`pnpm --filter @wujie/plugin dev`
3. 在 Chrome 扩展页重载插件。
4. 打开任意 `http/https` 页面，执行：
   - `console.error('bridge test', Date.now())`
5. 打开插件 `观测面板`，确认：
   - `WS Connected` 为 `Connected`
   - `Latest Errors` 有新增日志
   - `Bridge Sessions` 能看到当前 tab 会话

### 2) 同步数据验证（源域名 -> 当前页面）

1. 同时打开两个页面：
   - 源页面：域名包含你输入的 `sourceDomain`（例如 `react_web`）
   - 目标页面：当前活动 tab（即你要写入的页面）
2. 在插件 `同步数据` Tab 输入源域名，点击：
   - `同步源域名数据到当前页面`
3. 预期结果：
   - 显示 `localStorage Keys`（同步到目标页的 key 数）
   - 显示 `Cookies Copied`（复制到目标域的 cookie 数）
   - `Failed` 为 0 或较小（受浏览器 cookie 策略影响）

### 3) 工具箱验证（含 Rust 加速）

在 `工具箱` Tab 验证以下功能：

1. `Unicode -> 中文`
   - 输入：`\\u4f60\\u597d`
   - 预期输出：`你好`

2. `JSON 格式化（Rust）`
   - 输入合法 JSON（如 `{\"a\":1,\"b\":[2,3]}`）
   - 预期输出：格式化后的多行 JSON
   - 输入非法 JSON，预期输出错误提示

3. `文件 Diff 对比（Rust + similar）`
   - 左右输入不同文本，点击 `执行 Diff`
   - 预期输出 unified diff（含 `-` / `+` 变更行）

4. `网站二维码`
   - 输入 URL（如 `https://example.com`）
   - 预期显示对应二维码图片

5. `时间工具`
   - 点击 `获取当前时间戳`
   - 再点击 `时间戳转换`
   - 预期显示 ISO 时间和本地时间

### 4) 自动化任务验证（Cron + JS）

1. 在 `工具箱 -> 自动化任务` 中填写：
   - 任务名：`demo-task`
   - Cron：`*/1 * * * *`
   - 脚本：`return 'ok';`
2. 点击 `保存任务`
3. 等待 1 分钟左右，预期：
   - 任务列表显示 `lastRunAt`
   - `lastResult` 为 `ok`

## Stdio MCP 请求示例

先启动 bridge：

```bash
cargo run -p rust-bridge
```

然后向标准输入发送 JSON 行：

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

也支持自然语言兜底（非 JSON 输入）：

- `勇哥，帮我获取当前控制台日志`
- `勇哥，查看当前会话`
- `勇哥，查询状态`
- `勇哥，做一次连通性 ping`
- `勇哥，同步 key=foo value=bar`

说明：
- 自然语言会被 bridge 按关键词映射到 `get_console_errors / get_sessions / get_status / ping`。
- `sync_data` 支持轻量参数语法：`同步 key=xxx value=yyy`。
- 如未提供 `key/value`，会使用默认值：`wujie-ai-sync-key / demo-value`。

## 端到端联调流程

1. 启动 bridge：`cargo run -p rust-bridge`
2. 启动插件开发：`pnpm --filter @wujie/plugin dev`
3. 在 Chrome 扩展页重载插件。
4. 打开任意页面并执行：
   - `console.error('bridge test', Date.now())`
5. 打开插件 popup，确认：
   - `WS Connected`
   - `Latest Errors`
   - `Bridge Sessions`
6. 使用 `Sync Data` 卡片向当前 tab 或全部 tab 写入 localStorage。

## Trae MCP 接入

可直接参考示例配置文件：

- `docs/trae-mcp.config.example.json`

示例内容：

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

1. 打开 Trae 的 MCP 设置。
2. 新增一个 stdio MCP Server，名称填 `wujie-bridge`。
3. 将示例里的 `command / args / cwd` 复制进去。
4. 保存并重载 MCP Server。
5. 用以下请求验证：
   - `{"type":"ping","request_id":"req-ping"}`
   - `{"type":"get_status","request_id":"req-status"}`

如果 `get_status` 能返回 `total_sessions` 和 `total_errors`，说明 bridge 已接通。

## 常见问题排查

- `command not found: cargo`
  - 确认 Trae 使用的是和你终端一致的 shell 环境。

- bridge 启动了但没有页面数据
  - 重载插件并刷新页面一次。

- popup 显示 `WS disconnected`
  - 确认 `cargo run -p rust-bridge` 进程仍在运行。

- 看不到 console 错误
  - 请在 `http/https` 页面执行 `console.error('bridge test', Date.now())`（不要在浏览器内部页测试）。
