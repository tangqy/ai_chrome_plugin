import { initBridge, callBridge, ensureBridgeConnected, sendToBridge, setBridgeLogTarget, addBridgeMessageListener } from './bridge';
import { initAutomationTicker } from './cron';
import {
  handleCurlImport,
  handleMockDelete,
  handleMockPreview,
  handleMockToggle,
  handleMockUpsert,
  handleNetworkCreate,
  pushMockRulesToActiveTab
} from './mock';
import { initNetworkRecorder } from './network';
import { runDomainSync, runSyncData } from './operations';
import { broadcastSnapshot, hydrateState, persistState, snapshot, state } from './state';
import { RuntimeMessageTypes } from '../shared/validation';
import { getHumanVerifyTask, handleBridgeHumanVerifyMessage, setHumanVerifyTask } from './humanVerify';
import type { HumanFeedback } from '../shared/validation';

export default defineBackground(() => {
  console.log('[wujie-ai] background started');

  void (async () => {
    await hydrateState();
    initBridge();
    initAutomationTicker();
    initNetworkRecorder();
    broadcastSnapshot();

    addBridgeMessageListener((msg) => {
      console.log('[background] received ws message:', msg);
      handleBridgeHumanVerifyMessage(msg);
    });
  })();

  setInterval(() => {
    sendToBridge({ type: 'get_console_errors', ts: Date.now() });
    broadcastSnapshot();
  }, 2000);

  chrome.tabs.onActivated.addListener(() => void pushMockRulesToActiveTab());

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'PING') {
      sendResponse({ ok: true, ts: Date.now() });
      return true;
    }

    if (message?.type === 'PAGE_CONTEXT') {
      state.currentTabUrl = message?.payload?.url ?? null;
      sendToBridge({ type: 'page_context', ts: Date.now(), payload: { url: state.currentTabUrl, tabId: sender?.tab?.id ?? null } });
      void pushMockRulesToActiveTab();
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === 'CONSOLE_ERROR') {
      state.recentConsoleErrorCount += 1;
      sendToBridge({ type: 'console_error', ts: Date.now(), payload: { ...message.payload, tabId: sender?.tab?.id ?? null, url: sender?.tab?.url ?? state.currentTabUrl } });
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === 'BRIDGE_CONNECT') {
      ensureBridgeConnected();
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === 'BRIDGE_LOG_TARGET_SET') {
      const target = message?.payload?.target;
      if (target !== 'terminal' && target !== 'file' && target !== 'both') {
        sendResponse({ ok: false, error: 'invalid log target' });
        return true;
      }
      state.bridgeLogTarget = target;
      ensureBridgeConnected();
      setBridgeLogTarget(target);
      persistState();
      broadcastSnapshot();
      sendResponse({ ok: true, payload: { bridgeLogTarget: state.bridgeLogTarget } });
      return true;
    }

    if (message?.type === 'GET_STATUS') {
      sendResponse({ ok: true, payload: snapshot() });
      return true;
    }

    if (message?.type === 'MOCK_RULES_UPSERT') {
      sendResponse({ ok: true, payload: handleMockUpsert(message?.payload ?? {}) });
      return true;
    }

    if (message?.type === 'MOCK_RULES_DELETE') {
      sendResponse({ ok: true, payload: handleMockDelete(String(message?.payload?.id ?? '')) });
      return true;
    }

    if (message?.type === 'MOCK_RULES_TOGGLE') {
      sendResponse({ ok: true, payload: handleMockToggle(String(message?.payload?.id ?? ''), Boolean(message?.payload?.enabled)) });
      return true;
    }

    if (message?.type === 'MOCK_IMPORT_CURL_PARSE') {
      sendResponse({ ok: true, payload: handleCurlImport(String(message?.payload?.curl ?? '')) });
      return true;
    }

    if (message?.type === 'MOCK_CREATE_FROM_NETWORK_ENTRY') {
      sendResponse({ ok: true, payload: handleNetworkCreate(message?.payload?.entry ?? {}) });
      return true;
    }

    if (message?.type === 'MOCK_RULE_PREVIEW_RESPONSE') {
      sendResponse({ ok: true, payload: handleMockPreview(message?.payload ?? {}) });
      return true;
    }

    if (message?.type === 'PROXY_SET_MODE') {
      const mode = message?.payload?.mode === 'direct' ? 'direct' : 'system';
      const config: chrome.types.ChromeSettingSetDetails<chrome.proxy.ProxyConfig>['value'] = mode === 'direct' ? { mode: 'direct' } : { mode: 'system' };
      chrome.proxy.settings.set({ value: config, scope: 'regular' }, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        state.proxyMode = mode;
        persistState();
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

    if (message?.type === 'NETWORK_RECORDING_CLEAR') {
      state.networkEntries = [];
      broadcastSnapshot();
      sendResponse({ ok: true, payload: { networkEntryCount: 0 } });
      return true;
    }

    if (message?.type === 'NETWORK_RECORDING_FILTER_SET') {
      const payload = message?.payload ?? {};
      const methods = Array.isArray(payload.methods) ? payload.methods.map((x: unknown) => String(x).toUpperCase()) : [];
      const resourceTypes = Array.isArray(payload.resourceTypes) ? payload.resourceTypes.map((x: unknown) => String(x).toUpperCase()) : [];
      state.networkRecordingFilter = {
        pathKeyword: String(payload.pathKeyword ?? ''),
        pathMatchMode: payload.pathMatchMode === 'regex' ? 'regex' : 'contains',
        filterMode: payload.filterMode === 'deny' ? 'deny' : payload.filterMode === 'allow' ? 'allow' : 'all',
        methods: methods.filter(Boolean),
        resourceTypes: resourceTypes.filter(Boolean),
        bodyPreviewLimit: payload.bodyPreviewLimit === '1mb' || payload.bodyPreviewLimit === '5mb' ? payload.bodyPreviewLimit : '256kb'
      };
      persistState();
      broadcastSnapshot();
      sendResponse({ ok: true, payload: { networkRecordingFilter: state.networkRecordingFilter } });
      return true;
    }

    if (message?.type === 'NETWORK_RECORDING_EXPORT_CURL') {
      ensureBridgeConnected();
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
      persistState();
      broadcastSnapshot();
      sendResponse({ ok: true, payload: { tasks: state.automationTasks } });
      return true;
    }

    if (message?.type === 'AUTOMATION_DELETE') {
      state.automationTasks = state.automationTasks.filter((t) => t.id !== String(message?.payload?.id ?? ''));
      persistState();
      broadcastSnapshot();
      sendResponse({ ok: true, payload: { tasks: state.automationTasks } });
      return true;
    }

    if (message?.type === 'FORMAT_JSON_FAST') {
      ensureBridgeConnected();
      void callBridge('format_json', { input: String(message?.payload?.input ?? '') })
        .then((res) => sendResponse({ ok: true, payload: res }))
        .catch((err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : 'format_json failed' }));
      return true;
    }

    if (message?.type === 'DIFF_TEXT_FAST') {
      ensureBridgeConnected();
      void callBridge('diff_text', { left: String(message?.payload?.left ?? ''), right: String(message?.payload?.right ?? '') })
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
      ensureBridgeConnected();
      sendToBridge({ type: 'get_console_errors', ts: Date.now() });
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === RuntimeMessageTypes.humanVerifyPromptSet) {
      setHumanVerifyTask(message?.payload?.task ?? null);
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === RuntimeMessageTypes.humanVerifyPromptGet) {
      sendResponse({ ok: true, payload: { task: getHumanVerifyTask() } });
      return true;
    }

    if (message?.type === RuntimeMessageTypes.humanVerifyFeedbackSubmit) {
      ensureBridgeConnected();
      const payload = message?.payload as HumanFeedback;
      sendToBridge({ type: 'validation_human_feedback', ts: Date.now(), payload });
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === RuntimeMessageTypes.humanVerifyCompleted) {
      ensureBridgeConnected();
      sendToBridge({ type: 'validation_human_completed', ts: Date.now(), payload: message?.payload });
      sendResponse({ ok: true });
      return true;
    }

    return false;
  });
});
