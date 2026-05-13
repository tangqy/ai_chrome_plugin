export type RuntimeStatus = {
  wsConnected: boolean;
  currentTabUrl: string | null;
  recentConsoleErrorCount: number;
  sessions?: BridgeSession[];
  lastSyncResult?: SyncResult | null;
  lastDomainSyncResult?: DomainSyncResult | null;
  automationTasks?: AutomationTask[];
  mockRules?: MockRule[];
  proxyMode?: 'system' | 'direct';
  networkRecordingEnabled?: boolean;
  networkRecordingTabId?: number | null;
  networkEntryCount?: number;
  networkEntries?: NetworkEntry[];
  bridgeLogTarget?: 'terminal' | 'file' | 'both';
  networkRecordingFilter?: {
    pathKeyword: string;
    pathMatchMode: 'contains' | 'regex';
    filterMode: 'all' | 'allow' | 'deny';
    methods: string[];
    resourceTypes: string[];
    bodyPreviewLimit: '256kb' | '1mb' | '5mb';
  };
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

export type MockRule = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  scene: string;
  requestMatch: {
    method: string;
    pathPattern: string;
    queryMatch?: Record<string, string>;
    headerMatch?: Record<string, string>;
  };
  requestHeaderPatch?: Record<string, string>;
  responseBodyMode: 'fixed' | 'mockjs' | 'script';
  responseBodyRaw?: string;
  mockjsTemplate?: string;
  responseHeaders?: Record<string, string>;
  status: number;
  delayMs: number;
  script: string;
  imports: string[];
};

export type NetworkEntry = {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  resourceType?: string;
  statusCode?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  responseMimeType?: string;
  requestBodySize?: number;
  responseBodySize?: number;
  requestBodyTruncated?: boolean;
  responseBodyTruncated?: boolean;
  captureError?: string;
  ts: number;
};
