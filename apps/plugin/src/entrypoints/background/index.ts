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
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const broadcastSnapshot = () => {
    const snapshot = {
      wsConnected,
      currentTabUrl,
      recentConsoleErrorCount,
      errorItems: consoleErrorItems,
      sessions: bridgeSessions,
      lastSyncResult,
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
          lastSyncResult
        }
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
