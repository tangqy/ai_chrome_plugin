export type ErrorItem = {
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
  ts: number;
};

export type ProxyMode = 'system' | 'direct';
export type BridgeLogTarget = 'terminal' | 'file' | 'both';

export type NetworkRecordingFilter = {
  pathKeyword: string;
  pathMatchMode: 'contains' | 'regex';
  filterMode: 'all' | 'allow' | 'deny';
  methods: string[];
  resourceTypes: string[];
};
