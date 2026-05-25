## 回复语言

使用中文进行回答。

---

# Wujie AI Sensing Monorepo

## 技术栈

- 插件前端：React 18 + Ant Design 6 + WXT + Vite 8
- 桥接服务：Rust（tokio + tokio-tungstenite）
- GUI 客户端：Tauri 2 + React 18 + Ant Design 6 + Vite 6
- 工程管理：pnpm workspace（`apps/*`、`packages/*`）+ Cargo workspace（`crates/*`、`apps/gui/src-tauri`）
- 包管理器版本：`pnpm@9.12.3`（锁定于 `packageManager` 字段）

## 目录结构

| 路径 | 类型 | 说明 |
|---|---|---|
| `apps/plugin/` | WXT Chrome 扩展 | 插件前端入口，使用 `wxt` 命令 |
| `apps/gui/` | Tauri 2 桌面应用 | GUI 客户端，集成 Bridge 管理和日志查看 |
| `packages/protocol-ts/` | TS 库 | 协议类型定义，输出 `dist/index.d.ts` |
| `crates/rust-bridge/` | Rust 二进制 | WebSocket + MCP stdio 桥接服务 |
| `crates/rust-shared/` | Rust lib | 被 bridge 依赖的共享协议和逻辑 |

## 常用命令

```bash
# 安装依赖（必须在项目根目录）
pnpm install

# 启动插件开发服务器（WXT）
pnpm dev

# 分别运行 bridge（需要另一个终端）
ppm run bridge:run
# 等价于：
cargo run -p rust-bridge

# 全量构建（TS + Rust release）
pnpm build

# TS 类型检查
pnpm -r typecheck

# Lint（目前未配置，两个包都是 echo placeholder）
pnpm -r lint

# 单包构建
pnpm --filter @wujie/plugin build
pnpm --filter @wujie/plugin zip
pnpm --filter @wujie/protocol-ts build

# 启动 GUI 桌面应用（开发模式）
pnpm --filter @wujie/gui tauri dev

# 构建 GUI 发行版
pnpm --filter @wujie/gui tauri build

# 打包发行版（输出到 ./out/）
node scripts/package-all.mjs
```

## 开发流程

插件和 Bridge 是**两个独立进程**，必须同时运行：

1. 终端 1：`pnpm dev` → 启动 WXT 开发服务器
2. 终端 2：`cargo run -p rust-bridge` → 启动 Bridge（WebSocket + MCP）

插件通过 WebSocket 连接 Bridge。Bridge 未运行时插件显示 `WS Disconnected`。

## 打包顺序

`scripts/package-all.mjs` 执行顺序：

1. `cargo build -p rust-bridge --release`
2. `pnpm --filter @wujie/plugin build`
3. `pnpm --filter @wujie/plugin zip`
4. 复制 bridge 二进制 + 插件输出到 `./out/`

## TS 类型依赖

`packages/protocol-ts` 输出声明文件（`dist/index.d.ts`）供插件消费。修改协议类型时需先构建它，再构建插件。

## 插件入口点

| 文件 | 作用 |
|---|---|
| `apps/plugin/src/entrypoints/popup/` | 插件 popup 页面 |
| `apps/plugin/src/entrypoints/background/` | Service Worker（bridge 连接、cron、network、mock） |
| `apps/plugin/src/entrypoints/content/` | Content Script（`page-hook.ts`） |

WXT 配置：`apps/plugin/wxt.config.ts`，源码目录 `apps/plugin/src/`。

## 注意

- Lint 和格式化工具（ESLint/Prettier/clippy）均未配置
- `pnpm dev` 对应的是插件包的 `wxt` 命令（不是 `wxt dev`）
- Bridge 是 stdio MCP 服务器，可被 Trae 等工具通过 `cargo run -p rust-bridge` 接入
