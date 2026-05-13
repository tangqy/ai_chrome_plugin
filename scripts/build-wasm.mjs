import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const crateDir = resolve(root, 'crates/rust-shared');
const outDir = resolve(root, 'apps/plugin/public/wasm');

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', cwd: root, ...opts });
}

function tryRun(cmd, opts = {}) {
  try {
    execSync(cmd, { stdio: 'pipe', cwd: root, ...opts });
    return true;
  } catch {
    return false;
  }
}

function cleanWasmOut() {
  try {
    rmSync(outDir, { recursive: true, force: true });
  } catch {}
}

function log(msg) {
  process.stdout.write(`[wasm-build] ${msg}\n`);
}

if (!existsSync(crateDir)) {
  log('skip: crates/rust-shared not found');
  process.exit(0);
}

if (!tryRun('cargo --version')) {
  log('skip: cargo not found');
  cleanWasmOut();
  process.exit(0);
}

if (!tryRun('wasm-pack --version')) {
  log('skip: wasm-pack not found, use fallback (bridge/js)');
  cleanWasmOut();
  process.exit(0);
}

if (!tryRun('rustup target list --installed | rg wasm32-unknown-unknown')) {
  log('wasm32 target not installed, installing...');
  try {
    run('rustup target add wasm32-unknown-unknown');
  } catch {
    log('skip: failed to install wasm32 target, use fallback (bridge/js)');
    cleanWasmOut();
    process.exit(0);
  }
}

try {
  run(`wasm-pack build ${crateDir} --target web --out-dir ${outDir} --out-name rust_shared --features wasm`);
  log('ok: wasm artifacts generated');
} catch {
  log('skip: wasm build failed, use fallback (bridge/js)');
  cleanWasmOut();
  process.exit(0);
}
