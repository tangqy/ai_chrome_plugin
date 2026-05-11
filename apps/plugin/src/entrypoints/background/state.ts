import type {
  AutomationTask,
  BridgeSession,
  DomainSyncResult,
  ErrorItem,
  MockRule,
  NetworkEntry,
  ProxyMode,
  SyncResult
} from './types';

export type BackgroundState = {
  wsConnected: boolean;
  currentTabUrl: string | null;
  recentConsoleErrorCount: number;
  consoleErrorItems: ErrorItem[];
  bridgeSessions: BridgeSession[];
  lastSyncResult: SyncResult | null;
  lastDomainSyncResult: DomainSyncResult | null;
  automationTasks: AutomationTask[];
  mockRules: MockRule[];
  proxyMode: ProxyMode;
  networkRecordingEnabled: boolean;
  networkRecordingTabId: number | null;
  networkEntries: NetworkEntry[];
};

export const state: BackgroundState = {
  wsConnected: false,
  currentTabUrl: null,
  recentConsoleErrorCount: 0,
  consoleErrorItems: [],
  bridgeSessions: [],
  lastSyncResult: null,
  lastDomainSyncResult: null,
  automationTasks: [],
  mockRules: [],
  proxyMode: 'system',
  networkRecordingEnabled: false,
  networkRecordingTabId: null,
  networkEntries: []
};

export function snapshot() {
  return {
    wsConnected: state.wsConnected,
    currentTabUrl: state.currentTabUrl,
    recentConsoleErrorCount: state.recentConsoleErrorCount,
    errorItems: state.consoleErrorItems,
    sessions: state.bridgeSessions,
    lastSyncResult: state.lastSyncResult,
    lastDomainSyncResult: state.lastDomainSyncResult,
    automationTasks: state.automationTasks,
    mockRules: state.mockRules,
    proxyMode: state.proxyMode,
    networkRecordingEnabled: state.networkRecordingEnabled,
    networkRecordingTabId: state.networkRecordingTabId,
    networkEntryCount: state.networkEntries.length,
    networkEntries: state.networkEntries.slice(-200),
    updatedAt: Date.now()
  };
}

export function broadcastSnapshot() {
  void chrome.runtime.sendMessage({ type: 'STATUS_PUSH', payload: snapshot() }).catch(() => {});
}
