export type RuntimeStatus = {
  wsConnected: boolean;
  currentTabUrl: string | null;
  recentConsoleErrorCount: number;
  sessions?: BridgeSession[];
  lastSyncResult?: SyncResult | null;
  lastDomainSyncResult?: DomainSyncResult | null;
  automationTasks?: AutomationTask[];
  proxyMode?: 'system' | 'direct';
  networkRecordingEnabled?: boolean;
  networkRecordingTabId?: number | null;
  networkEntryCount?: number;
};

export type ConsoleErrorItem = {
  message: string;
  url?: string | null;
  tab_id?: number | null;
  ts?: number;
};

export type BridgeSession = {
  tab_id: number;
  url: string;
  last_seen_ts: number;
  error_count: number;
};

export type SyncResult = {
  mode: 'all' | 'current';
  key: string;
  value: string;
  success: number;
  failed: number;
  at: number;
};

export type DomainSyncResult = {
  sourceDomain: string;
  targetUrl: string;
  localStorageKeys: number;
  cookiesCopied: number;
  failed: number;
  at: number;
};

export type AutomationTask = {
  id: string;
  name: string;
  cron: string;
  script: string;
  enabled: boolean;
  lastRunAt?: number;
  lastResult?: string;
};
