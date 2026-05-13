import { broadcastSnapshot, state } from './state';

function normalizeDomainInput(input: string): string {
  const raw = input.trim().toLowerCase();
  if (!raw) return '';
  try {
    const candidate = raw.includes('://') ? raw : `http://${raw}`;
    return new URL(candidate).hostname.toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//, '').split('/')[0] ?? '';
  }
}

function isScriptableUrl(url?: string) {
  if (!url) return false;
  return !url.startsWith('chrome://') && !url.startsWith('chrome-extension://') && !url.startsWith('edge://');
}

async function readLocalStorageEntries(tabId: number, tabUrl?: string) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'GET_LOCAL_STORAGE_ALL' });
    if (res?.ok) return (res.data ?? {}) as Record<string, string>;
  } catch {}
  if (!isScriptableUrl(tabUrl)) {
    throw new Error('source tab is not scriptable');
  }
  const injected = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      const out: Record<string, string> = {};
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (!key) continue;
        out[key] = window.localStorage.getItem(key) ?? '';
      }
      return out;
    }
  });
  return (injected[0]?.result ?? {}) as Record<string, string>;
}

async function writeLocalStorageEntries(tabId: number, tabUrl: string | undefined, entries: Record<string, string>) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, {
      type: 'SET_LOCAL_STORAGE_BULK',
      payload: { entries }
    });
    if (res?.ok) return true;
  } catch {}
  if (!isScriptableUrl(tabUrl)) {
    return false;
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [entries],
    func: (items) => {
      for (const [k, v] of Object.entries(items ?? {})) window.localStorage.setItem(k, String(v));
    }
  });
  return true;
}

async function writeLocalStorageKeyValue(tabId: number, tabUrl: string | undefined, key: string, value: string) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'SET_LOCAL_STORAGE', payload: { key, value } });
    if (res?.ok) return true;
  } catch {}
  if (!isScriptableUrl(tabUrl)) return false;
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [key, value],
    func: (k, v) => window.localStorage.setItem(String(k), String(v))
  });
  return true;
}

export async function runSyncData(mode: 'all' | 'current', key: string, value: string) {
  const query: chrome.tabs.QueryInfo = mode === 'current' ? { active: true, currentWindow: true } : {};
  const tabs = await chrome.tabs.query(query);
  const targetTabs = tabs.filter((tab) => typeof tab.id === 'number');
  let success = 0;
  let failed = 0;

  await Promise.all(
    targetTabs.map(async (tab) => {
      try {
        const ok = await writeLocalStorageKeyValue(tab.id!, tab.url, key, value);
        if (ok) success += 1;
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
  const normalized = normalizeDomainInput(sourceDomain);
  if (!normalized) {
    throw new Error('invalid source domain');
  }
  const sourceTab = allTabs.find((tab) => {
    if (!tab.url) return false;
    try {
      const host = new URL(tab.url).hostname.toLowerCase();
      return host === normalized || host.endsWith(`.${normalized}`) || host.includes(normalized);
    } catch {
      return false;
    }
  });
  if (!sourceTab?.id) throw new Error(`source tab not found for domain: ${normalized}`);

  let failed = 0;
  let localStorageKeys = 0;
  let cookiesCopied = 0;

  const entries = await readLocalStorageEntries(sourceTab.id, sourceTab.url);
  localStorageKeys = Object.keys(entries).length;

  try {
    const ok = await writeLocalStorageEntries(currentTab.id, currentTab.url, entries);
    if (!ok) failed += 1;
  } catch {
    failed += 1;
  }

  const sourceCookies = await chrome.cookies.getAll({ domain: normalized });
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
