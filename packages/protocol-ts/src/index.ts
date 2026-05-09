export type BridgeRequest =
  | { type: 'ping'; requestId: string }
  | { type: 'sync_data'; requestId: string; payload: { key: string; value: string } }
  | { type: 'get_console_errors'; requestId: string }
  | { type: 'get_sessions'; requestId: string };

export type ConsoleErrorItem = {
  message: string;
  url?: string;
  tab_id?: number;
  ts: number;
};

export type SessionItem = {
  tab_id: number;
  url: string;
  last_seen_ts: number;
  error_count: number;
};

export type BridgeResponse =
  | { type: 'pong'; requestId: string; ts: number }
  | { type: 'sync_result'; requestId: string; ok: boolean; count: number }
  | { type: 'console_errors'; requestId: string; count: number; items: ConsoleErrorItem[] }
  | { type: 'sessions'; requestId: string; count: number; items: SessionItem[] }
  | { type: 'error'; requestId: string; code: string; message: string };
