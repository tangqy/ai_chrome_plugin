import type {
  AutomationTask,
  BridgeLogTarget,
  BridgeSession,
  DomainSyncResult,
  ErrorItem,
  MockRule,
  NetworkEntry,
  NetworkRecordingFilter,
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
  bridgeLogTarget: BridgeLogTarget;
  networkRecordingEnabled: boolean;
  networkRecordingTabId: number | null;
  networkEntries: NetworkEntry[];
  networkRecordingFilter: NetworkRecordingFilter;
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
  bridgeLogTarget: 'both',
  networkRecordingEnabled: false,
  networkRecordingTabId: null,
  networkEntries: [],
  networkRecordingFilter: {
    pathKeyword: '',
    pathMatchMode: 'contains',
    filterMode: 'all',
    methods: [],
    resourceTypes: ['XHR'],
    bodyPreviewLimit: '256kb'
  }
};

const PERSIST_KEY = 'wujie_background_prefs_v1';

type PersistedState = {
  automationTasks: AutomationTask[];
  mockRules: MockRule[];
  proxyMode: ProxyMode;
  bridgeLogTarget: BridgeLogTarget;
  networkRecordingFilter: NetworkRecordingFilter;
};

export async function hydrateState() {
  try {
    const stored = await chrome.storage.local.get(PERSIST_KEY);
    const data = stored?.[PERSIST_KEY] as Partial<PersistedState> | undefined;
    if (!data) return;
    if (Array.isArray(data.automationTasks)) state.automationTasks = data.automationTasks;
    if (Array.isArray(data.mockRules)) state.mockRules = data.mockRules;
    if (data.proxyMode === 'direct' || data.proxyMode === 'system') state.proxyMode = data.proxyMode;
    if (data.bridgeLogTarget === 'terminal' || data.bridgeLogTarget === 'file' || data.bridgeLogTarget === 'both') {
      state.bridgeLogTarget = data.bridgeLogTarget;
    }
    const filter = data.networkRecordingFilter;
    if (filter && typeof filter === 'object') {
      state.networkRecordingFilter = {
        pathKeyword: String(filter.pathKeyword ?? ''),
        pathMatchMode: filter.pathMatchMode === 'regex' ? 'regex' : 'contains',
        filterMode: filter.filterMode === 'allow' || filter.filterMode === 'deny' ? filter.filterMode : 'all',
        methods: Array.isArray(filter.methods) ? filter.methods.map((x) => String(x).toUpperCase()) : [],
        resourceTypes: Array.isArray(filter.resourceTypes) ? filter.resourceTypes.map((x) => String(x).toUpperCase()) : ['XHR'],
        bodyPreviewLimit: filter.bodyPreviewLimit === '1mb' || filter.bodyPreviewLimit === '5mb' ? filter.bodyPreviewLimit : '256kb'
      };
    }
  } catch {}
}

export function persistState() {
  const data: PersistedState = {
    automationTasks: state.automationTasks,
    mockRules: state.mockRules,
    proxyMode: state.proxyMode,
    bridgeLogTarget: state.bridgeLogTarget,
    networkRecordingFilter: state.networkRecordingFilter
  };
  void chrome.storage.local.set({ [PERSIST_KEY]: data }).catch(() => {});
}

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
    bridgeLogTarget: state.bridgeLogTarget,
    networkRecordingEnabled: state.networkRecordingEnabled,
    networkRecordingTabId: state.networkRecordingTabId,
    networkEntryCount: state.networkEntries.length,
    networkEntries: state.networkEntries.slice(-200),
    networkRecordingFilter: state.networkRecordingFilter,
    updatedAt: Date.now()
  };
}

export function broadcastSnapshot() {
  void chrome.runtime.sendMessage({ type: 'STATUS_PUSH', payload: snapshot() }).catch(() => {});
}
