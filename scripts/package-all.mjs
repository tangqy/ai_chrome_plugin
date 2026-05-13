import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const outDir = resolve(root, 'out');
const pluginDir = resolve(root, 'apps/plugin');
const pluginOutDir = resolve(pluginDir, '.output');
const bridgeTargetDir = resolve(root, 'target/release');

function run(cmd, cwd = root) {
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function tryCopy(src, dest) {
  if (!existsSync(src)) return false;
  cpSync(src, dest, { recursive: true });
  return true;
}

function main() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  run('cargo build -p rust-bridge --release');
  run('pnpm --filter @wujie/plugin build');
  run('pnpm --filter @wujie/plugin zip');

  const platform = process.platform;
  const bridgeName = platform === 'win32' ? 'rust-bridge.exe' : 'rust-bridge';
  const distBridgeName = platform === 'win32' ? 'wujie-mcp-bridge.exe' : 'wujie-mcp-bridge';

  const bridgeSrc = resolve(bridgeTargetDir, bridgeName);
  const bridgeDest = resolve(outDir, distBridgeName);

  if (!existsSync(bridgeSrc)) {
    throw new Error(`bridge binary not found: ${bridgeSrc}`);
  }
  cpSync(bridgeSrc, bridgeDest);

  const unpackedSrc = resolve(pluginOutDir, 'chrome-mv3');
  const unpackedDest = resolve(outDir, 'plugin-unpacked');
  if (!tryCopy(unpackedSrc, unpackedDest)) {
    throw new Error(`plugin unpacked output not found: ${unpackedSrc}`);
  }

  const zipCandidates = [
    resolve(pluginOutDir, 'wujieplugin-0.1.0-chrome.zip'),
    resolve(pluginOutDir, 'chrome-mv3.zip'),
    resolve(pluginOutDir, 'chrome-mv3', 'chrome-mv3.zip')
  ];
  const zipSrc = zipCandidates.find((p) => existsSync(p));
  if (zipSrc) {
    cpSync(zipSrc, resolve(outDir, 'plugin.zip'));
  }

  const readme = `Wujie AI package output\n\n- Bridge: ${distBridgeName}\n- Plugin unpacked: ./plugin-unpacked\n- Plugin zip: ./plugin.zip (if generated)\n\nRun bridge:\n  ${platform === 'win32' ? '.\\\\' : './'}${distBridgeName}\n`;
  writeFileSync(resolve(outDir, 'README.txt'), readme, 'utf-8');

  process.stdout.write(`\n[package-all] done: ${outDir}\n`);
}

main();
