import { broadcastSnapshot, state } from './state';

export async function runSyncData(mode: 'all' | 'current', key: string, value: string) {
  const query: chrome.tabs.QueryInfo = mode === 'current' ? { active: true, currentWindow: true } : {};
  const tabs = await chrome.tabs.query(query);
  const targetTabs = tabs.filter((tab) => typeof tab.id === 'number');
  let success = 0;
  let failed = 0;

  await Promise.all(
    targetTabs.map(async (tab) => {
      try {
        const res = await chrome.tabs.sendMessage(tab.id!, { type: 'SET_LOCAL_STORAGE', payload: { key, value } });
        if (res?.ok) success += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    })
  );

  state.lastSyncResult = { mode, key, value, success, failed, at: Date.now() };
  broadcastSnapshot();
  return state.lastSyncResult;
}

export async function runDomainSync(sourceDomain: string) {
  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!currentTab?.id || !currentTab.url) throw new Error('current tab not found');

  const targetUrl = currentTab.url;
  const targetHost = new URL(targetUrl).hostname;
  const allTabs = await chrome.tabs.query({});
  const sourceTab = allTabs.find((tab) => {
    if (!tab.url) return false;
    try {
      return new URL(tab.url).hostname.includes(sourceDomain);
    } catch {
      return false;
    }
  });
  if (!sourceTab?.id) throw new Error(`source tab not found for domain: ${sourceDomain}`);

  let failed = 0;
  let localStorageKeys = 0;
  let cookiesCopied = 0;

  const localStorageRes = await chrome.tabs.sendMessage(sourceTab.id, { type: 'GET_LOCAL_STORAGE_ALL' });
  const entries = (localStorageRes?.data ?? {}) as Record<string, string>;
  localStorageKeys = Object.keys(entries).length;

  try {
    const writeRes = await chrome.tabs.sendMessage(currentTab.id, {
      type: 'SET_LOCAL_STORAGE_BULK',
      payload: { entries }
    });
    if (!writeRes?.ok) failed += 1;
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

  state.lastDomainSyncResult = {
    sourceDomain,
    targetUrl,
    localStorageKeys,
    cookiesCopied,
    failed,
    at: Date.now()
  };
  broadcastSnapshot();
  return state.lastDomainSyncResult;
}
