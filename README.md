# Wujie AI Sensing Monorepo

Tech stack:
- React
- Rust
- pnpm workspace
- WXT
- Vite 8 (via WXT)

## Structure

- `apps/plugin`: Chrome extension built with WXT + React.
- `crates/rust-bridge`: Rust MCP bridge binary.
- `crates/rust-shared`: Rust shared protocol library.
- `packages/protocol-ts`: TypeScript protocol package.

## Quick start

```bash
pnpm install
pnpm dev
```

In another terminal:

```bash
cargo run -p rust-bridge
```

## Validate

```bash
pnpm -r typecheck
cargo check
```
