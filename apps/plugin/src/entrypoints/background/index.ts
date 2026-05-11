export default defineBackground(() => {
  console.log('[wujie-ai] background started');
  let wsConnected = false;
  let currentTabUrl: string | null = null;
  let recentConsoleErrorCount = 0;
  let consoleErrorItems: Array<{
    message: string;
    url?: string | null;
    tab_id?: number | null;
    ts?: number;
  }> = [];
  let bridgeSessions: Array<{
    tab_id: number;
    url: string;
    last_seen_ts: number;
    error_count: number;
  }> = [];
  let lastSyncResult: {
    mode: 'all' | 'current';
    key: string;
    value: string;
    success: number;
    failed: number;
    at: number;
  } | null = null;
  let lastDomainSyncResult: {
    sourceDomain: string;
    targetUrl: string;
    localStorageKeys: number;
    cookiesCopied: number;
    failed: number;
    at: number;
  } | null = null;
  type AutomationTask = {
    id: string;
    name: string;
    cron: string;
    script: string;
    enabled: boolean;
    lastRunAt?: number;
    lastResult?: string;
  };
  let automationTasks: AutomationTask[] = [];
  let proxyMode: 'system' | 'direct' = 'system';
  type NetworkEntry = {
    id: string;
    url: string;
    method: string;
    headers: Record<string, string>;
    postData?: string;
    ts: number;
  };
  let networkRecordingEnabled = false;
  let networkRecordingTabId: number | null = null;
  let networkEntries: NetworkEntry[] = [];
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  const pendingBridgeCalls = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  const broadcastSnapshot = () => {
    const snapshot = {
      wsConnected,
      currentTabUrl,
      recentConsoleErrorCount,
      errorItems: consoleErrorItems,
      sessions: bridgeSessions,
      lastSyncResult,
      lastDomainSyncResult,
      automationTasks,
      proxyMode,
      networkRecordingEnabled,
      networkRecordingTabId,
      networkEntryCount: networkEntries.length,
      updatedAt: Date.now()
    };
    void chrome.runtime.sendMessage({ type: 'STATUS_PUSH', payload: snapshot }).catch(() => {});
  };

  const setWsConnected = (connected: boolean) => {
    wsConnected = connected;
  };

  const sendToBridge = (payload: unknown) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify(payload));
  };

  const callBridge = (type: string, payload: Record<string, unknown>) =>
    new Promise<unknown>((resolve, reject) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        reject(new Error('bridge socket is not connected'));
        return;
      }
      const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timer = setTimeout(() => {
        pendingBridgeCalls.delete(requestId);
        reject(new Error(`bridge call timeout: ${type}`));
      }, 5000);
      pendingBridgeCalls.set(requestId, { resolve, reject, timer });
      socket.send(JSON.stringify({ type, requestId, payload }));
    });

  const connectBridge = () => {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    socket = new WebSocket('ws://127.0.0.1:8787/ws');

    socket.onopen = () => {
      setWsConnected(true);
      socket?.send(JSON.stringify({ type: 'hello', source: 'plugin-background', ts: Date.now() }));
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg?.type === 'ping') {
          socket?.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
        if (msg?.type === 'console_errors') {
          consoleErrorItems = Array.isArray(msg.items) ? msg.items : [];
          bridgeSessions = Array.isArray(msg.sessions) ? msg.sessions : [];
          broadcastSnapshot();
        }
        if (
          (msg?.type === 'format_json_result' ||
            msg?.type === 'diff_text_result' ||
            msg?.type === 'network_to_curl_result') &&
          msg?.requestId
        ) {
          const record = pendingBridgeCalls.get(String(msg.requestId));
          if (record) {
            clearTimeout(record.timer);
            pendingBridgeCalls.delete(String(msg.requestId));
            record.resolve(msg);
          }
        }
      } catch {
        // Ignore invalid bridge message.
      }
    };

    socket.onclose = () => {
      setWsConnected(false);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      reconnectTimer = setTimeout(connectBridge, 2000);
    };

    socket.onerror = () => {
      setWsConnected(false);
    };
  };

  connectBridge();
  chrome.alarms.create('wujie-ai-automation-tick', { periodInMinutes: 1 });
  chrome.debugger.onEvent.addListener((source, method, params) => {
    if (!networkRecordingEnabled) return;
    if (!source.tabId || source.tabId !== networkRecordingTabId) return;
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
    const request = p?.request;
    if (!request?.url || !request?.method) return;
    const headers: Record<string, string> = {};
    const rawHeaders = request.headers ?? {};
    for (const key of Object.keys(rawHeaders)) {
      headers[key] = String(rawHeaders[key]);
    }
    networkEntries.push({
      id: String(p?.requestId ?? `${Date.now()}`),
      url: String(request.url),
      method: String(request.method),
      headers,
      postData: request.postData ? String(request.postData) : undefined,
      ts: Date.now()
    });
    if (networkEntries.length > 1000) {
      networkEntries = networkEntries.slice(-1000);
    }
    broadcastSnapshot();
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== 'wujie-ai-automation-tick') return;
    const now = new Date();
    for (const task of automationTasks) {
      if (!task.enabled) continue;
      if (!cronMatches(task.cron, now)) continue;
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function(task.script);
        const result = fn();
        task.lastRunAt = Date.now();
        task.lastResult = result === undefined ? 'ok' : String(result);
      } catch (err) {
        task.lastRunAt = Date.now();
        task.lastResult = `error: ${err instanceof Error ? err.message : 'unknown'}`;
      }
    }
    broadcastSnapshot();
  });
  pollTimer = setInterval(() => {
    sendToBridge({ type: 'get_console_errors', ts: Date.now() });
    broadcastSnapshot();
  }, 2000);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'PING') {
      sendResponse({ ok: true, ts: Date.now() });
      return true;
    }
    if (message?.type === 'PAGE_CONTEXT') {
      currentTabUrl = message?.payload?.url ?? null;
      sendToBridge({
        type: 'page_context',
        ts: Date.now(),
        payload: {
          url: currentTabUrl,
          tabId: _sender?.tab?.id ?? null
        }
      });
      sendResponse({ ok: true });
      return true;
    }
    if (message?.type === 'CONSOLE_ERROR') {
      recentConsoleErrorCount += 1;
      sendToBridge({
        type: 'console_error',
        ts: Date.now(),
        payload: {
          ...message.payload,
          tabId: _sender?.tab?.id ?? null,
          url: _sender?.tab?.url ?? currentTabUrl
        }
      });
      sendResponse({ ok: true });
      return true;
    }
    if (message?.type === 'SET_WS_CONNECTED') {
      wsConnected = Boolean(message?.payload?.connected);
      sendResponse({ ok: true });
      return true;
    }
    if (message?.type === 'GET_STATUS') {
      sendResponse({
        ok: true,
        payload: {
          wsConnected,
          currentTabUrl,
          recentConsoleErrorCount,
          errorItems: consoleErrorItems,
          sessions: bridgeSessions,
          lastSyncResult,
          lastDomainSyncResult,
          automationTasks,
          proxyMode,
          networkRecordingEnabled,
          networkRecordingTabId,
          networkEntryCount: networkEntries.length
        }
      });
      return true;
    }
    if (message?.type === 'PROXY_SET_MODE') {
      const mode = message?.payload?.mode === 'direct' ? 'direct' : 'system';
      const config: chrome.types.ChromeSettingSetDetails<chrome.proxy.ProxyConfig>['value'] =
        mode === 'direct'
          ? { mode: 'direct' }
          : { mode: 'system' };
      chrome.proxy.settings.set({ value: config, scope: 'regular' }, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        proxyMode = mode;
        broadcastSnapshot();
        sendResponse({ ok: true, payload: { proxyMode } });
      });
      return true;
    }
    if (message?.type === 'PROXY_GET_MODE') {
      chrome.proxy.settings.get({ incognito: false }, (details) => {
        const mode = details?.value?.mode === 'direct' ? 'direct' : 'system';
        proxyMode = mode;
        sendResponse({ ok: true, payload: { proxyMode } });
      });
      return true;
    }
    if (message?.type === 'NETWORK_RECORDING_SET') {
      const enabled = Boolean(message?.payload?.enabled);
      const run = async () => {
        if (enabled) {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) throw new Error('current tab not found');
          const target = { tabId: tab.id };
          await chrome.debugger.attach(target, '1.3');
          await chrome.debugger.sendCommand(target, 'Network.enable');
          networkRecordingEnabled = true;
          networkRecordingTabId = tab.id;
          networkEntries = [];
        } else {
          if (networkRecordingTabId !== null) {
            try {
              await chrome.debugger.detach({ tabId: networkRecordingTabId });
            } catch {}
          }
          networkRecordingEnabled = false;
          networkRecordingTabId = null;
        }
        broadcastSnapshot();
        return {
          ok: true,
          payload: {
            networkRecordingEnabled,
            networkRecordingTabId,
            networkEntryCount: networkEntries.length
          }
        };
      };
      void run().then(sendResponse).catch((err) => {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : 'network recording set failed' });
      });
      return true;
    }
    if (message?.type === 'NETWORK_RECORDING_EXPORT_CURL') {
      void callBridge('network_to_curl', { entries: networkEntries })
        .then((res) => sendResponse({ ok: true, payload: res }))
        .catch((err) =>
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : 'network export failed'
          })
        );
      return true;
    }
    if (message?.type === 'AUTOMATION_LIST') {
      sendResponse({ ok: true, payload: { tasks: automationTasks } });
      return true;
    }
    if (message?.type === 'AUTOMATION_UPSERT') {
      const payload = message?.payload ?? {};
      const id = String(payload.id ?? `task-${Date.now()}`);
      const name = String(payload.name ?? id);
      const cron = String(payload.cron ?? '* * * * *');
      const script = String(payload.script ?? 'return "ok";');
      const enabled = Boolean(payload.enabled ?? true);
      const idx = automationTasks.findIndex((t) => t.id === id);
      const next: AutomationTask = { id, name, cron, script, enabled };
      if (idx >= 0) {
        automationTasks[idx] = { ...automationTasks[idx], ...next };
      } else {
        automationTasks.push(next);
      }
      broadcastSnapshot();
      sendResponse({ ok: true, payload: { tasks: automationTasks } });
      return true;
    }
    if (message?.type === 'AUTOMATION_DELETE') {
      const id = String(message?.payload?.id ?? '');
      automationTasks = automationTasks.filter((t) => t.id !== id);
      broadcastSnapshot();
      sendResponse({ ok: true, payload: { tasks: automationTasks } });
      return true;
    }
    if (message?.type === 'FORMAT_JSON_FAST') {
      void callBridge('format_json', { input: String(message?.payload?.input ?? '') })
        .then((res) => sendResponse({ ok: true, payload: res }))
        .catch((err) =>
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : 'format_json failed'
          })
        );
      return true;
    }
    if (message?.type === 'DIFF_TEXT_FAST') {
      void callBridge('diff_text', {
        left: String(message?.payload?.left ?? ''),
        right: String(message?.payload?.right ?? '')
      })
        .then((res) => sendResponse({ ok: true, payload: res }))
        .catch((err) =>
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : 'diff_text failed'
          })
        );
      return true;
    }
    if (message?.type === 'SYNC_FROM_SOURCE_DOMAIN') {
      const sourceDomain = String(message?.payload?.sourceDomain ?? '').trim();
      if (!sourceDomain) {
        sendResponse({ ok: false, error: 'sourceDomain is required' });
        return true;
      }

      const run = async () => {
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!currentTab?.id || !currentTab.url) {
          throw new Error('current tab not found');
        }
        const targetUrl = currentTab.url;
        const targetHost = new URL(targetUrl).hostname;

        const allTabs = await chrome.tabs.query({});
        const sourceTab = allTabs.find((tab) => {
          if (!tab.url) return false;
          try {
            const host = new URL(tab.url).hostname;
            return host.includes(sourceDomain);
          } catch {
            return false;
          }
        });
        if (!sourceTab?.id) {
          throw new Error(`source tab not found for domain: ${sourceDomain}`);
        }

        let failed = 0;
        let localStorageKeys = 0;
        let cookiesCopied = 0;

        const localStorageRes = await chrome.tabs.sendMessage(sourceTab.id, {
          type: 'GET_LOCAL_STORAGE_ALL'
        });
        const entries = (localStorageRes?.data ?? {}) as Record<string, string>;
        localStorageKeys = Object.keys(entries).length;

        try {
          const writeRes = await chrome.tabs.sendMessage(currentTab.id, {
            type: 'SET_LOCAL_STORAGE_BULK',
            payload: { entries }
          });
          if (!writeRes?.ok) {
            failed += 1;
          }
        } catch {
          failed += 1;
        }

        const sourceCookies = await chrome.cookies.getAll({ domain: sourceDomain });
        for (const cookie of sourceCookies) {
          try {
            const sameSite =
              cookie.sameSite === 'strict'
                ? 'strict'
                : cookie.sameSite === 'lax'
                  ? 'lax'
                  : cookie.sameSite === 'no_restriction'
                    ? 'no_restriction'
                    : undefined;
            await chrome.cookies.set({
              url: targetUrl,
              name: cookie.name,
              value: cookie.value,
              path: cookie.path,
              secure: cookie.secure,
              httpOnly: cookie.httpOnly,
              sameSite,
              expirationDate: cookie.expirationDate,
              domain: targetHost
            });
            cookiesCopied += 1;
          } catch {
            failed += 1;
          }
        }

        lastDomainSyncResult = {
          sourceDomain,
          targetUrl,
          localStorageKeys,
          cookiesCopied,
          failed,
          at: Date.now()
        };
        broadcastSnapshot();
        return { ok: true, payload: lastDomainSyncResult };
      };

      void run().then(sendResponse).catch((err) => {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : 'domain sync failed'
        });
      });
      return true;
    }
    if (message?.type === 'SYNC_DATA') {
      const mode = message?.payload?.mode === 'current' ? 'current' : 'all';
      const key = String(message?.payload?.key ?? '');
      const value = String(message?.payload?.value ?? '');

      if (!key) {
        sendResponse({ ok: false, error: 'key is required' });
        return true;
      }

      const run = async () => {
        const query: chrome.tabs.QueryInfo =
          mode === 'current' ? { active: true, currentWindow: true } : {};
        const tabs = await chrome.tabs.query(query);
        const targetTabs = tabs.filter((tab) => typeof tab.id === 'number');
        let success = 0;
        let failed = 0;

        await Promise.all(
          targetTabs.map(async (tab) => {
            try {
              const res = await chrome.tabs.sendMessage(tab.id!, {
                type: 'SET_LOCAL_STORAGE',
                payload: { key, value }
              });
              if (res?.ok) {
                success += 1;
              } else {
                failed += 1;
              }
            } catch {
              failed += 1;
            }
          })
        );

        lastSyncResult = {
          mode,
          key,
          value,
          success,
          failed,
          at: Date.now()
        };
        broadcastSnapshot();
        return { ok: true, payload: lastSyncResult };
      };

      void run().then(sendResponse).catch((err) => {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : 'sync_data failed'
        });
      });
      return true;
    }
    if (message?.type === 'GET_ERROR_ITEMS') {
      sendResponse({
        ok: true,
        payload: {
          items: consoleErrorItems
        }
      });
      return true;
    }
    if (message?.type === 'GET_CONSOLE_ERRORS') {
      sendToBridge({ type: 'get_console_errors', ts: Date.now() });
      sendResponse({ ok: true });
      return true;
    }
    return false;
  });
});

function cronMatches(cron: string, now: Date): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [min, hour, day, mon, week] = parts;
  return (
    partMatches(min, now.getMinutes()) &&
    partMatches(hour, now.getHours()) &&
    partMatches(day, now.getDate()) &&
    partMatches(mon, now.getMonth() + 1) &&
    partMatches(week, now.getDay())
  );
}

function partMatches(expr: string, value: number): boolean {
  if (expr === '*') return true;
  if (/^\d+$/.test(expr)) return Number(expr) === value;
  if (/^\*\/\d+$/.test(expr)) {
    const step = Number(expr.slice(2));
    return step > 0 && value % step === 0;
  }
  const list = expr.split(',');
  return list.some((item) => /^\d+$/.test(item) && Number(item) === value);
}
