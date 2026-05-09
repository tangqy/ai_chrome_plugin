export default defineBackground(() => {
  console.log('[wujie-ai] background started');

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'PING') {
      sendResponse({ ok: true, ts: Date.now() });
      return true;
    }
    return false;
  });
});
