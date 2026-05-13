import type { MockRule, NetworkEntry } from './types';
import { broadcastSnapshot, persistState, state } from './state';

export type MockDraft = {
  name: string;
  method: string;
  pathPattern: string;
  headers: Record<string, string>;
  postData?: string;
};

function safeStringMap(input: string): Record<string, string> {
  try {
    const obj = JSON.parse(input);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) out[k] = String(v);
    return out;
  } catch {
    return {};
  }
}

function parseCurl(curl: string): MockDraft {
  const methodMatch = curl.match(/(?:^|\s)-X\s+(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)/i);
  const method = (methodMatch?.[1] ?? 'GET').toUpperCase();

  const urlMatch = curl.match(/'(https?:\/\/[^']+)'|"(https?:\/\/[^"]+)"|(https?:\/\/\S+)/i);
  const url = urlMatch?.[1] ?? urlMatch?.[2] ?? urlMatch?.[3] ?? 'https://example.com/api/mock';
  let pathPattern = '/api/mock';
  try {
    pathPattern = new URL(url).pathname || '/';
  } catch {}

  const headers: Record<string, string> = {};
  const headerRegex = /(?:^|\s)-H\s+'([^']+)'|(?:^|\s)-H\s+"([^"]+)"/gi;
  let h: RegExpExecArray | null;
  while ((h = headerRegex.exec(curl)) !== null) {
    const pair = h[1] ?? h[2] ?? '';
    const idx = pair.indexOf(':');
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    headers[key.toLowerCase()] = val;
  }

  const bodyMatch = curl.match(/(?:--data|-d)\s+'([^']*)'|(?:--data|-d)\s+"([^"]*)"/i);
  const postData = bodyMatch?.[1] ?? bodyMatch?.[2] ?? undefined;

  return {
    name: `curl-${method.toLowerCase()}-${pathPattern.replace(/\//g, '_').slice(0, 20)}`,
    method,
    pathPattern,
    headers,
    postData
  };
}

function entryToDraft(entry: NetworkEntry): MockDraft {
  let pathPattern = '/';
  try {
    pathPattern = new URL(entry.url).pathname || '/';
  } catch {}
  return {
    name: `net-${entry.method.toLowerCase()}-${pathPattern.replace(/\//g, '_').slice(0, 20)}`,
    method: entry.method.toUpperCase(),
    pathPattern,
    headers: Object.fromEntries(Object.entries(entry.headers).map(([k, v]) => [k.toLowerCase(), String(v)])),
    postData: entry.postData
  };
}

function toRule(payload: Record<string, unknown>, fallbackId: string): MockRule {
  const method = String(payload.method ?? 'GET').toUpperCase();
  const pathPattern = String(payload.pathPattern ?? '/api/mock');

  return {
    id: String(payload.id ?? fallbackId),
    name: String(payload.name ?? fallbackId),
    enabled: Boolean(payload.enabled ?? true),
    priority: Number(payload.priority ?? 100),
    scene: String(payload.scene ?? 'default'),
    requestMatch: {
      method,
      pathPattern,
      queryMatch: safeStringMap(String(payload.queryMatch ?? '{}')),
      headerMatch: safeStringMap(String(payload.headerMatch ?? '{}'))
    },
    requestHeaderPatch: safeStringMap(String(payload.requestHeaderPatch ?? '{}')),
    responseBodyMode: String(payload.responseBodyMode ?? 'fixed') as MockRule['responseBodyMode'],
    responseBodyRaw: String(payload.responseBodyRaw ?? ''),
    mockjsTemplate: String(payload.mockjsTemplate ?? ''),
    responseHeaders: safeStringMap(String(payload.responseHeaders ?? '{}')),
    status: Number(payload.status ?? 200),
    delayMs: Number(payload.delayMs ?? 0),
    script: String(payload.script ?? 'return { ok: true };'),
    imports: Array.isArray(payload.imports) ? payload.imports.map((x) => String(x)) : []
  };
}

export async function pushMockRulesToActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  await chrome.tabs.sendMessage(tab.id, { type: 'SET_MOCK_RULES', payload: { rules: state.mockRules } }).catch(() => {});
}

export function handleMockUpsert(payload: Record<string, unknown>) {
  const id = String(payload.id ?? `mock-${Date.now()}`);
  const idx = state.mockRules.findIndex((r) => r.id === id);
  const next = toRule(payload, id);
  if (idx >= 0) state.mockRules[idx] = { ...state.mockRules[idx], ...next };
  else state.mockRules.push(next);
  state.mockRules.sort((a, b) => a.priority - b.priority);
  persistState();
  void pushMockRulesToActiveTab();
  broadcastSnapshot();
  return { rules: state.mockRules };
}

export function handleMockDelete(id: string) {
  state.mockRules = state.mockRules.filter((r) => r.id !== id);
  persistState();
  void pushMockRulesToActiveTab();
  broadcastSnapshot();
  return { rules: state.mockRules };
}

export function handleMockToggle(id: string, enabled: boolean) {
  state.mockRules = state.mockRules.map((r) => (r.id === id ? { ...r, enabled } : r));
  persistState();
  void pushMockRulesToActiveTab();
  broadcastSnapshot();
  return { rules: state.mockRules };
}

export function handleCurlImport(curl: string) {
  return { draft: parseCurl(curl) };
}

export function handleNetworkCreate(entry: NetworkEntry) {
  return { draft: entryToDraft(entry) };
}

export function handleMockPreview(payload: Record<string, unknown>) {
  const mode = String(payload.responseBodyMode ?? 'fixed');
  const raw = String(payload.responseBodyRaw ?? '{}');
  if (mode === 'fixed') {
    try {
      return { ok: true, output: JSON.parse(raw) };
    } catch {
      return { ok: true, output: raw };
    }
  }
  if (mode === 'mockjs') {
    try {
      return { ok: true, output: JSON.parse(String(payload.mockjsTemplate ?? '{}')) };
    } catch {
      return { ok: false, error: 'mockjsTemplate 不是合法 JSON' };
    }
  }
  return { ok: true, output: 'script 模式请在页面请求中验证' };
}
