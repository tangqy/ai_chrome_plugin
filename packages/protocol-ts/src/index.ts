export type BridgeRequest =
  | { type: 'ping'; requestId: string }
  | { type: 'sync_data'; requestId: string; payload: { key: string; value: string } };

export type BridgeResponse =
  | { type: 'pong'; requestId: string; ts: number }
  | { type: 'sync_result'; requestId: string; ok: boolean; count: number }
  | { type: 'error'; requestId: string; code: string; message: string };
