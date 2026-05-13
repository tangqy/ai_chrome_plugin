import { broadcastSnapshot, state } from './state';
import { sendToBridge } from './bridge';

const LOG_CHUNK_CHARS = 64 * 1024;

type PendingRequest = {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  resourceType?: string;
  statusCode?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  responseMimeType?: string;
  requestBodySize?: number;
  responseBodySize?: number;
  requestBodyTruncated?: boolean;
  responseBodyTruncated?: boolean;
  captureError?: string;
  ts: number;
};

const pending = new Map<string, PendingRequest>();

function toStringMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = String(val);
  return out;
}

function getBodyPreviewLimitBytes() {
  const limit = state.networkRecordingFilter.bodyPreviewLimit;
  if (limit === '1mb') return 1024 * 1024;
  if (limit === '5mb') return 5 * 1024 * 1024;
  return 256 * 1024;
}

function shouldRecord(entry: { method: string; url: string; resourceType?: string }) {
  const filter = state.networkRecordingFilter;
  const method = entry.method.toUpperCase();
  const resourceType = (entry.resourceType ?? '').toUpperCase();
  const url = entry.url.toLowerCase();
  const pathKeyword = filter.pathKeyword.trim().toLowerCase();
  const methods = filter.methods.map((m) => m.toUpperCase());
  const resourceTypes = filter.resourceTypes.map((r) => r.toUpperCase());
  const pathMatched = (() => {
    if (!pathKeyword) return true;
    if (filter.pathMatchMode === 'regex') {
      try {
        return new RegExp(pathKeyword, 'i').test(url);
      } catch {
        return false;
      }
    }
    return url.includes(pathKeyword);
  })();
  const methodMatched = methods.length === 0 ? true : methods.includes(method);
  const resourceMatched = resourceTypes.length === 0 ? true : resourceTypes.includes(resourceType);
  const matched = pathMatched && methodMatched && resourceMatched;
  if (filter.filterMode === 'all') return true;
  return filter.filterMode === 'deny' ? !matched : matched;
}

function pushCompleted(entry: PendingRequest, tabId: number) {
  state.networkEntries.push(entry);
  if (state.networkEntries.length > 1000) state.networkEntries = state.networkEntries.slice(-1000);
  sendToBridge({
    type: 'network_request',
    ts: Date.now(),
    payload: {
      tabId,
      requestId: entry.id,
      method: entry.method,
      url: entry.url,
      resourceType: entry.resourceType,
      statusCode: entry.statusCode,
      requestBodySize: entry.requestBodySize,
      responseBodySize: entry.responseBodySize,
      requestBodyTruncated: entry.requestBodyTruncated,
      responseBodyTruncated: entry.responseBodyTruncated,
      captureError: entry.captureError
    }
  });
  broadcastSnapshot();
}

async function sha256Hex(input: string) {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sendBodyChunks(payload: {
  tabId: number;
  requestId: string;
  url: string;
  method: string;
  part: 'request' | 'response';
  content: string;
  ts: number;
}) {
  const totalChunks = Math.max(1, Math.ceil(payload.content.length / LOG_CHUNK_CHARS));
  const contentSha256 = await sha256Hex(payload.content);
  for (let i = 0; i < totalChunks; i += 1) {
    const start = i * LOG_CHUNK_CHARS;
    const end = Math.min(payload.content.length, start + LOG_CHUNK_CHARS);
    const chunk = payload.content.slice(start, end);
    sendToBridge({
      type: 'network_body_chunk',
      ts: payload.ts,
      payload: {
        tabId: payload.tabId,
        requestId: payload.requestId,
        url: payload.url,
        method: payload.method,
        part: payload.part,
        chunkIndex: i,
        totalChunks,
        contentSha256,
        chunkSha256: await sha256Hex(chunk),
        chunk
      }
    });
  }
}

export function initNetworkRecorder() {
  chrome.debugger.onEvent.addListener((source, method, params) => {
    if (!state.networkRecordingEnabled) return;
    if (!source.tabId || source.tabId !== state.networkRecordingTabId) return;
    const p = params as Record<string, unknown>;
    const requestId = String(p.requestId ?? '');
    if (!requestId) return;

    if (method === 'Network.requestWillBeSent') {
      const request = (p.request ?? {}) as Record<string, unknown>;
      const url = String(request.url ?? '');
      const reqMethod = String(request.method ?? '');
      if (!url || !reqMethod) return;
      const resourceType = p.type ? String(p.type) : undefined;
      if (!shouldRecord({ method: reqMethod, url, resourceType })) return;
      pending.set(requestId, {
        id: requestId,
        url,
        method: reqMethod,
        headers: toStringMap(request.headers),
        postData: request.postData ? String(request.postData) : undefined,
        resourceType,
        ts: Date.now()
      });
      return;
    }

    if (method === 'Network.responseReceived') {
      const item = pending.get(requestId);
      if (!item) return;
      const response = (p.response ?? {}) as Record<string, unknown>;
      item.statusCode = typeof response.status === 'number' ? response.status : undefined;
      item.responseHeaders = toStringMap(response.headers);
      item.responseMimeType = response.mimeType ? String(response.mimeType) : undefined;
      return;
    }

    if (method === 'Network.loadingFinished') {
      const item = pending.get(requestId);
      if (!item || !source.tabId) return;
      const target = { tabId: source.tabId };
      const finalize = async () => {
        const ts = Date.now();
        const previewLimitBytes = getBodyPreviewLimitBytes();
        try {
          const postData = await chrome.debugger.sendCommand(target, 'Network.getRequestPostData', { requestId }) as { postData?: string };
          if (postData?.postData) {
            const raw = String(postData.postData);
            const size = new TextEncoder().encode(raw).length;
            item.requestBodySize = size;
            if (size > previewLimitBytes) {
              item.requestBodyTruncated = true;
              item.postData = `${raw.slice(0, previewLimitBytes)}\n...[truncated]`;
              await sendBodyChunks({
                tabId: source.tabId!,
                requestId,
                url: item.url,
                method: item.method,
                part: 'request',
                content: raw,
                ts
              });
            } else {
              item.postData = raw;
            }
          }
        } catch (e) {
          item.captureError = `requestBody: ${e instanceof Error ? e.message : 'unavailable'}`;
        }
        try {
          const body = await chrome.debugger.sendCommand(target, 'Network.getResponseBody', { requestId }) as { body?: string; base64Encoded?: boolean };
          if (body?.body) {
            const content = body.base64Encoded ? `[base64] ${body.body}` : String(body.body);
            const size = new TextEncoder().encode(content).length;
            item.responseBodySize = size;
            if (size > previewLimitBytes) {
              item.responseBodyTruncated = true;
              item.responseBody = `${content.slice(0, previewLimitBytes)}\n...[truncated]`;
              await sendBodyChunks({
                tabId: source.tabId!,
                requestId,
                url: item.url,
                method: item.method,
                part: 'response',
                content,
                ts
              });
            } else {
              item.responseBody = content;
            }
          }
        } catch (e) {
          const msg = `responseBody: ${e instanceof Error ? e.message : 'unavailable'}`;
          item.captureError = item.captureError ? `${item.captureError}; ${msg}` : msg;
        }
        pending.delete(requestId);
        pushCompleted(item, source.tabId!);
      };
      void finalize();
      return;
    }

    if (method === 'Network.loadingFailed') {
      const item = pending.get(requestId);
      if (!item || !source.tabId) return;
      pending.delete(requestId);
      pushCompleted(item, source.tabId);
    }
  });
}
