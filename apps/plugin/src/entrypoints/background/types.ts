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

export type NetworkEntry = {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  resourceType?: string;
  ts: number;
};

export type ProxyMode = 'system' | 'direct';
