import { broadcastSnapshot, state } from './state';

export function initNetworkRecorder() {
  chrome.debugger.onEvent.addListener((source, method, params) => {
    if (!state.networkRecordingEnabled) return;
    if (!source.tabId || source.tabId !== state.networkRecordingTabId) return;
    if (method !== 'Network.requestWillBeSent') return;

    const p = params as {
      request?: {
        url?: string;
        method?: string;
        headers?: Record<string, unknown>;
        postData?: string;
      };
      requestId?: string;
    };

    const request = p.request;
    if (!request?.url || !request?.method) return;

    const headers: Record<string, string> = {};
    const rawHeaders = request.headers ?? {};
    for (const key of Object.keys(rawHeaders)) headers[key] = String(rawHeaders[key]);

    state.networkEntries.push({
      id: String(p.requestId ?? `${Date.now()}`),
      url: String(request.url),
      method: String(request.method),
      headers,
      postData: request.postData ? String(request.postData) : undefined,
      ts: Date.now()
    });

    if (state.networkEntries.length > 1000) {
      state.networkEntries = state.networkEntries.slice(-1000);
    }
    broadcastSnapshot();
  });
}
