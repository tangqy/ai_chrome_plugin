import { broadcastSnapshot, state } from './state';

type PendingCall = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const pendingBridgeCalls = new Map<string, PendingCall>();

export function sendToBridge(payload: unknown) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

export function callBridge(type: string, payload: Record<string, unknown>) {
  return new Promise<unknown>((resolve, reject) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      reject(new Error('bridge socket is not connected'));
      return;
    }
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => {
      pendingBridgeCalls.delete(requestId);
      reject(new Error(`bridge call timeout: ${type}`));
    }, 5000);
    pendingBridgeCalls.set(requestId, { resolve, reject, timer });
    socket.send(JSON.stringify({ type, requestId, payload }));
  });
}

export function initBridge() {
  connectBridge();
}

function connectBridge() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  socket = new WebSocket('ws://127.0.0.1:8787/ws');

  socket.onopen = () => {
    state.wsConnected = true;
    socket?.send(JSON.stringify({ type: 'hello', source: 'plugin-background', ts: Date.now() }));
    broadcastSnapshot();
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(String(event.data));
      if (msg?.type === 'ping') {
        socket?.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      }
      if (msg?.type === 'console_errors') {
        state.consoleErrorItems = Array.isArray(msg.items) ? msg.items : [];
        state.bridgeSessions = Array.isArray(msg.sessions) ? msg.sessions : [];
        broadcastSnapshot();
      }
      if ((msg?.type === 'format_json_result' || msg?.type === 'diff_text_result' || msg?.type === 'network_to_curl_result') && msg?.requestId) {
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
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectBridge, 2000);
  };

  socket.onerror = () => {
    state.wsConnected = false;
    broadcastSnapshot();
  };
}
