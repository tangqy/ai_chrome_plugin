import React from 'react';
import type {
  AutomationTask,
  BridgeSession,
  ConsoleErrorItem,
  DomainSyncResult,
  MockRule,
  NetworkEntry,
  RuntimeStatus,
  SyncResult
} from '../types';

type State = {
  runtime: RuntimeStatus;
  errorItems: ConsoleErrorItem[];
  bridgeSessions: BridgeSession[];
  syncResult: SyncResult | null;
  domainSyncResult: DomainSyncResult | null;
  automationTasks: AutomationTask[];
  mockRules: MockRule[];
  networkEntries: NetworkEntry[];
};

const initialRuntime: RuntimeStatus = {
  wsConnected: false,
  currentTabUrl: null,
  recentConsoleErrorCount: 0
};

export function useRuntimeStatus() {
  const [state, setState] = React.useState<State>({
    runtime: initialRuntime,
    errorItems: [],
    bridgeSessions: [],
    syncResult: null,
    domainSyncResult: null,
    automationTasks: [],
    mockRules: [],
    networkEntries: []
  });

  const applyPayload = React.useCallback((payload: RuntimeStatus & { errorItems?: ConsoleErrorItem[] }) => {
    setState((prev) => ({
      runtime: {
        wsConnected: payload.wsConnected,
        currentTabUrl: payload.currentTabUrl,
        recentConsoleErrorCount: payload.recentConsoleErrorCount,
        proxyMode: payload.proxyMode,
        networkRecordingEnabled: payload.networkRecordingEnabled,
        networkRecordingTabId: payload.networkRecordingTabId,
        networkEntryCount: payload.networkEntryCount
      },
      errorItems: Array.isArray(payload.errorItems) ? payload.errorItems : prev.errorItems,
      bridgeSessions: Array.isArray(payload.sessions) ? payload.sessions : prev.bridgeSessions,
      syncResult: payload.lastSyncResult ?? prev.syncResult,
      domainSyncResult: payload.lastDomainSyncResult ?? prev.domainSyncResult,
      automationTasks: Array.isArray(payload.automationTasks) ? payload.automationTasks : prev.automationTasks,
      mockRules: Array.isArray(payload.mockRules) ? payload.mockRules : prev.mockRules,
      networkEntries: Array.isArray(payload.networkEntries) ? payload.networkEntries : prev.networkEntries
    }));
  }, []);

  const refreshStatus = React.useCallback(async () => {
    const res = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    if (res?.ok && res?.payload) {
      applyPayload(res.payload as RuntimeStatus & { errorItems?: ConsoleErrorItem[] });
    }
  }, [applyPayload]);

  React.useEffect(() => {
    void refreshStatus();
    const timer = setInterval(() => void refreshStatus(), 1000);
    const listener = (message: unknown) => {
      const m = message as { type?: string; payload?: RuntimeStatus & { errorItems?: ConsoleErrorItem[] } };
      if (m?.type === 'STATUS_PUSH' && m.payload) applyPayload(m.payload);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      clearInterval(timer);
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [applyPayload, refreshStatus]);

  return {
    state,
    setSyncResult: (syncResult: SyncResult | null) => setState((prev) => ({ ...prev, syncResult })),
    setDomainSyncResult: (domainSyncResult: DomainSyncResult | null) => setState((prev) => ({ ...prev, domainSyncResult })),
    refreshStatus
  };
}
