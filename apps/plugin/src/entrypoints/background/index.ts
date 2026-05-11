import { initBridge, callBridge, sendToBridge } from './bridge';
import { initAutomationTicker } from './cron';
import { initNetworkRecorder } from './network';
import { runDomainSync, runSyncData } from './operations';
import { broadcastSnapshot, snapshot, state } from './state';

export default defineBackground(() => {
  console.log('[wujie-ai] background started');

  initBridge();
  initAutomationTicker();
  initNetworkRecorder();

  setInterval(() => {
    sendToBridge({ type: 'get_console_errors', ts: Date.now() });
    broadcastSnapshot();
  }, 2000);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'PING') {
      sendResponse({ ok: true, ts: Date.now() });
      return true;
    }

    if (message?.type === 'PAGE_CONTEXT') {
      state.currentTabUrl = message?.payload?.url ?? null;
      sendToBridge({
        type: 'page_context',
        ts: Date.now(),
        payload: { url: state.currentTabUrl, tabId: sender?.tab?.id ?? null }
      });
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === 'CONSOLE_ERROR') {
      state.recentConsoleErrorCount += 1;
      sendToBridge({
        type: 'console_error',
        ts: Date.now(),
        payload: {
          ...message.payload,
          tabId: sender?.tab?.id ?? null,
          url: sender?.tab?.url ?? state.currentTabUrl
        }
      });
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === 'GET_STATUS') {
      sendResponse({ ok: true, payload: snapshot() });
      return true;
    }

    if (message?.type === 'PROXY_SET_MODE') {
      const mode = message?.payload?.mode === 'direct' ? 'direct' : 'system';
      const config: chrome.types.ChromeSettingSetDetails<chrome.proxy.ProxyConfig>['value'] =
        mode === 'direct' ? { mode: 'direct' } : { mode: 'system' };
      chrome.proxy.settings.set({ value: config, scope: 'regular' }, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        state.proxyMode = mode;
        broadcastSnapshot();
        sendResponse({ ok: true, payload: { proxyMode: state.proxyMode } });
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
          state.networkRecordingEnabled = true;
          state.networkRecordingTabId = tab.id;
          state.networkEntries = [];
        } else {
          if (state.networkRecordingTabId !== null) {
            try {
              await chrome.debugger.detach({ tabId: state.networkRecordingTabId });
            } catch {}
          }
          state.networkRecordingEnabled = false;
          state.networkRecordingTabId = null;
        }
        broadcastSnapshot();
        return {
          networkRecordingEnabled: state.networkRecordingEnabled,
          networkRecordingTabId: state.networkRecordingTabId,
          networkEntryCount: state.networkEntries.length
        };
      };
      void run().then((payload) => sendResponse({ ok: true, payload })).catch((err) => {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : 'network recording set failed' });
      });
      return true;
    }

    if (message?.type === 'NETWORK_RECORDING_EXPORT_CURL') {
      void callBridge('network_to_curl', { entries: state.networkEntries })
        .then((res) => sendResponse({ ok: true, payload: res }))
        .catch((err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : 'network export failed' }));
      return true;
    }

    if (message?.type === 'AUTOMATION_UPSERT') {
      const payload = message?.payload ?? {};
      const id = String(payload.id ?? `task-${Date.now()}`);
      const idx = state.automationTasks.findIndex((t) => t.id === id);
      const next = {
        id,
        name: String(payload.name ?? id),
        cron: String(payload.cron ?? '* * * * *'),
        script: String(payload.script ?? 'return "ok";'),
        enabled: Boolean(payload.enabled ?? true)
      };
      if (idx >= 0) state.automationTasks[idx] = { ...state.automationTasks[idx], ...next };
      else state.automationTasks.push(next);
      broadcastSnapshot();
      sendResponse({ ok: true, payload: { tasks: state.automationTasks } });
      return true;
    }

    if (message?.type === 'AUTOMATION_DELETE') {
      state.automationTasks = state.automationTasks.filter((t) => t.id !== String(message?.payload?.id ?? ''));
      broadcastSnapshot();
      sendResponse({ ok: true, payload: { tasks: state.automationTasks } });
      return true;
    }

    if (message?.type === 'FORMAT_JSON_FAST') {
      void callBridge('format_json', { input: String(message?.payload?.input ?? '') })
        .then((res) => sendResponse({ ok: true, payload: res }))
        .catch((err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : 'format_json failed' }));
      return true;
    }

    if (message?.type === 'DIFF_TEXT_FAST') {
      void callBridge('diff_text', {
        left: String(message?.payload?.left ?? ''),
        right: String(message?.payload?.right ?? '')
      })
        .then((res) => sendResponse({ ok: true, payload: res }))
        .catch((err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : 'diff_text failed' }));
      return true;
    }

    if (message?.type === 'SYNC_FROM_SOURCE_DOMAIN') {
      const sourceDomain = String(message?.payload?.sourceDomain ?? '').trim();
      if (!sourceDomain) {
        sendResponse({ ok: false, error: 'sourceDomain is required' });
        return true;
      }
      void runDomainSync(sourceDomain)
        .then((payload) => sendResponse({ ok: true, payload }))
        .catch((err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : 'domain sync failed' }));
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
      void runSyncData(mode, key, value)
        .then((payload) => sendResponse({ ok: true, payload }))
        .catch((err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : 'sync_data failed' }));
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
