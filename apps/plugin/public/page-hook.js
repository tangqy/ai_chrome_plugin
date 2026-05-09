(() => {
  const originalError = console.error;
  console.error = (...args) => {
    try {
      window.postMessage(
        {
          source: 'wujie-ai-page',
          type: 'console_error',
          payload: { message: args.map((v) => String(v)).join(' ') }
        },
        '*'
      );
    } catch {}
    return originalError.apply(console, args);
  };
})();
