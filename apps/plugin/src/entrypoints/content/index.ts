export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    const url = location.href;
    console.log('[wujie-ai] content injected:', url);

    chrome.runtime.sendMessage({ type: 'PAGE_CONTEXT', payload: { url } }).catch(() => {
      // Ignore missing receiver during early startup.
    });

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
          payload: {
            message: String(event.reason ?? 'Unhandled promise rejection')
          }
        })
        .catch(() => {});
    });

    const relayFromPage = (event: MessageEvent) => {
      const data = event.data as
        | {
            source?: string;
            type?: string;
            payload?: { message?: string };
          }
        | undefined;
      if (!data || data.source !== 'wujie-ai-page' || data.type !== 'console_error') {
        return;
      }
      chrome.runtime
        .sendMessage({
          type: 'CONSOLE_ERROR',
          payload: {
            message: data.payload?.message ?? 'console.error'
          }
        })
        .catch(() => {});
    };
    window.addEventListener('message', relayFromPage);

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('page-hook.js');
    script.onload = () => script.remove();
    (document.documentElement || document.head || document.body).appendChild(script);

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'SET_LOCAL_STORAGE') {
        try {
          const key = String(message?.payload?.key ?? '');
          const value = String(message?.payload?.value ?? '');
          localStorage.setItem(key, value);
          sendResponse({ ok: true, url: location.href });
        } catch (err) {
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : 'set localStorage failed',
            url: location.href
          });
        }
        return true;
      }
      return false;
    });
  }
});
