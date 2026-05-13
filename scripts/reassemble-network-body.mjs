#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function usage() {
  console.log(
    'Usage: node scripts/reassemble-network-body.mjs --file <logFile> --request-id <id> --part <request|response> [--out <outputFile>]'
  );
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { file: '', requestId: '', part: '', out: '' };
  for (let i = 0; i < args.length; i += 1) {
    const k = args[i];
    const v = args[i + 1];
    if (k === '--file') out.file = v ?? '';
    if (k === '--request-id') out.requestId = v ?? '';
    if (k === '--part') out.part = v ?? '';
    if (k === '--out') out.out = v ?? '';
  }
  return out;
}

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

const { file, requestId, part, out } = parseArgs();
if (!file || !requestId || !part) {
  usage();
  process.exit(1);
}

const abs = path.resolve(file);
if (!fs.existsSync(abs)) {
  console.error(`log file not found: ${abs}`);
  process.exit(1);
}

const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/).filter(Boolean);
const items = [];
for (const line of lines) {
  try {
    const obj = JSON.parse(line);
    if (obj?.kind !== 'network_body_chunk') continue;
    if (String(obj.requestId) !== requestId) continue;
    if (String(obj.part) !== part) continue;
    items.push(obj);
  } catch {}
}

if (items.length === 0) {
  console.error('no chunk found');
  process.exit(2);
}

items.sort((a, b) => Number(a.chunkIndex) - Number(b.chunkIndex));
const totalChunks = Number(items[0].totalChunks ?? 0);
if (totalChunks !== items.length) {
  console.warn(`chunk count mismatch: expect=${totalChunks}, got=${items.length}`);
}

for (const item of items) {
  if (item.chunkSha256) {
    const actual = sha256Hex(String(item.chunk ?? ''));
    if (actual !== String(item.chunkSha256)) {
      console.error(`chunk hash mismatch at index=${item.chunkIndex}`);
      process.exit(3);
    }
  }
}

const content = items.map((x) => String(x.chunk ?? '')).join('');
const fullHash = sha256Hex(content);
const expected = String(items[0].contentSha256 ?? '');
const ok = expected ? fullHash === expected : true;

if (!ok) {
  console.error(`content hash mismatch: expected=${expected} actual=${fullHash}`);
  process.exit(4);
}

if (out) {
  const outPath = path.resolve(out);
  fs.writeFileSync(outPath, content, 'utf8');
  console.log(`reassembled ok, wrote ${outPath}, bytes=${Buffer.byteLength(content, 'utf8')}, sha256=${fullHash}`);
} else {
  process.stdout.write(content);
}
