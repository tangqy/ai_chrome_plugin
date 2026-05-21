import { broadcastSnapshot, state } from './state';

type PendingCall = {
  resolve: (value: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type BridgeMessageListener = (message: unknown) => void;

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let bridgeDisabled = false;
let lazyMode = true;
const pendingBridgeCalls = new Map<string, PendingCall>();
const messageListeners = new Set<BridgeMessageListener>();

function settlePendingAsUnavailable() {
  for (const [, pending] of pendingBridgeCalls) {
    clearTimeout(pending.timer);
    pending.resolve({ ok: false, error: 'bridge unavailable' });
  }
  pendingBridgeCalls.clear();
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  if (lazyMode) return;
  clearReconnect();
  reconnectTimer = setTimeout(connectBridge, 3000);
}

export function isBridgeConnected() {
  return !!socket && socket.readyState === WebSocket.OPEN;
}

export function ensureBridgeConnected() {
  if (bridgeDisabled) return;
  lazyMode = false;
  connectBridge();
}

export function sendToBridge(payload: unknown) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch {}
}

export function setBridgeLogTarget(target: 'terminal' | 'file' | 'both') {
  sendToBridge({ type: 'set_log_target', payload: { target }, ts: Date.now() });
}

export function callBridge(type: string, payload: Record<string, unknown>) {
  return new Promise<unknown>((resolve) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      resolve({ ok: false, error: `bridge socket is not connected: ${type}` });
      return;
    }
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => {
      pendingBridgeCalls.delete(requestId);
      resolve({ ok: false, error: `bridge call timeout: ${type}` });
    }, 5000);
    pendingBridgeCalls.set(requestId, { resolve, timer });
    try {
      socket.send(JSON.stringify({ type, requestId, payload }));
    } catch {
      clearTimeout(timer);
      pendingBridgeCalls.delete(requestId);
      resolve({ ok: false, error: `bridge send failed: ${type}` });
    }
  });
}

export function initBridge() {
  // 不再使用懒加载，启动直接连接
  lazyMode = false;
  state.wsConnected = false;
  broadcastSnapshot();
  connectBridge();
}

export function addBridgeMessageListener(listener: BridgeMessageListener) {
  messageListeners.add(listener);
  return () => messageListeners.delete(listener);
}

function connectBridge() {
  if (bridgeDisabled) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

  try {
    socket = new WebSocket('ws://127.0.0.1:8787/ws');
  } catch {
    state.wsConnected = false;
    broadcastSnapshot();
    settlePendingAsUnavailable();
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    state.wsConnected = true;
    try {
      socket?.send(JSON.stringify({ type: 'hello', source: 'plugin-background', ts: Date.now() }));
      socket?.send(
        JSON.stringify({
          type: 'set_log_target',
          payload: { target: state.bridgeLogTarget },
          ts: Date.now()
        })
      );
    } catch {}
    broadcastSnapshot();
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(String(event.data));
      for (const listener of messageListeners) {
        try {
          listener(msg);
        } catch {}
      }
      if (msg?.type === 'ping') {
        socket?.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      }
      if (msg?.type === 'console_errors') {
        state.consoleErrorItems = Array.isArray(msg.items) ? msg.items : [];
        state.bridgeSessions = Array.isArray(msg.sessions) ? msg.sessions : [];
        broadcastSnapshot();
      }
      if (
        (msg?.type === 'format_json_result' ||
          msg?.type === 'diff_text_result' ||
          msg?.type === 'network_to_curl_result') &&
        msg?.requestId
      ) {
        const record = pendingBridgeCalls.get(String(msg.requestId));
        if (record) {
          clearTimeout(record.timer);
          pendingBridgeCalls.delete(String(msg.requestId));
          record.resolve(msg);
        }
      }
    } catch {}
  };

  socket.onclose = () => {
    state.wsConnected = false;
    broadcastSnapshot();
    settlePendingAsUnavailable();
    scheduleReconnect();
  };

  socket.onerror = () => {
    state.wsConnected = false;
    broadcastSnapshot();
  };
}
