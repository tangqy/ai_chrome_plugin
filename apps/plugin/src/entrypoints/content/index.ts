export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    const url = location.href;
    console.log('[wujie-ai] content injected:', url);

    chrome.runtime.sendMessage({ type: 'PAGE_CONTEXT', payload: { url } }).catch(() => {
      // Ignore missing receiver during early startup.
    });
  }
});
