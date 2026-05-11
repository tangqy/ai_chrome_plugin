export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    const url = location.href;
    console.log('[wujie-ai] content injected:', url);

    chrome.runtime.sendMessage({ type: 'PAGE_CONTEXT', payload: { url } }).catch(() => {});

    window.addEventListener('error', (event) => {
      chrome.runtime
        .sendMessage({
          type: 'CONSOLE_ERROR',
          payload: {
            message: event.message,
            source: event.filename,
            lineno: event.lineno,
            colno: event.colno
          }
        })
        .catch(() => {});
    });

    window.addEventListener('unhandledrejection', (event) => {
      chrome.runtime
        .sendMessage({
          type: 'CONSOLE_ERROR',
          payload: { message: String(event.reason ?? 'Unhandled promise rejection') }
        })
        .catch(() => {});
    });

    const relayFromPage = (event: MessageEvent) => {
      const data = event.data as
        | { source?: string; type?: string; payload?: { message?: string } }
        | undefined;
      if (!data || data.source !== 'wujie-ai-page' || data.type !== 'console_error') return;
      chrome.runtime
        .sendMessage({ type: 'CONSOLE_ERROR', payload: { message: data.payload?.message ?? 'console.error' } })
        .catch(() => {});
    };
    window.addEventListener('message', relayFromPage);

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('page-hook.js');
    script.onload = () => script.remove();
    (document.documentElement || document.head || document.body).appendChild(script);

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'GET_LOCAL_STORAGE_ALL') {
        try {
          const data: Record<string, string> = {};
          for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (!key) continue;
            data[key] = localStorage.getItem(key) ?? '';
          }
          sendResponse({ ok: true, data, url: location.href });
        } catch (err) {
          sendResponse({ ok: false, error: err instanceof Error ? err.message : 'read localStorage failed', url: location.href });
        }
        return true;
      }

      if (message?.type === 'SET_LOCAL_STORAGE_BULK') {
        try {
          const entries = (message?.payload?.entries ?? {}) as Record<string, string>;
          const keys = Object.keys(entries);
          for (const key of keys) localStorage.setItem(key, String(entries[key] ?? ''));
          sendResponse({ ok: true, count: keys.length, url: location.href });
        } catch (err) {
          sendResponse({ ok: false, error: err instanceof Error ? err.message : 'bulk set localStorage failed', url: location.href });
        }
        return true;
      }

      if (message?.type === 'SET_LOCAL_STORAGE') {
        try {
          const key = String(message?.payload?.key ?? '');
          const value = String(message?.payload?.value ?? '');
          localStorage.setItem(key, value);
          sendResponse({ ok: true, url: location.href });
        } catch (err) {
          sendResponse({ ok: false, error: err instanceof Error ? err.message : 'set localStorage failed', url: location.href });
        }
        return true;
      }

      if (message?.type === 'SET_MOCK_RULES') {
        window.postMessage({ source: 'wujie-ai-content', type: 'WUJIE_MOCK_RULES_SET', payload: message?.payload?.rules ?? [] }, '*');
        sendResponse({ ok: true, count: Array.isArray(message?.payload?.rules) ? message.payload.rules.length : 0 });
        return true;
      }

      return false;
    });
  }
});
