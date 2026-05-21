import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Card,
  Button,
  Tag,
  Input,
  Space,
  Typography,
  Select,
  message,
} from 'antd';
import {
  SendOutlined,
  LinkOutlined,
  DisconnectOutlined,
  ClearOutlined,
} from '@ant-design/icons';

const { TextArea } = Input;
const { Text } = Typography;

type WsStatus = 'disconnected' | 'connecting' | 'connected';

interface HistoryEntry {
  dir: 'send' | 'recv';
  ts: string;
  data: string;
}

const BRIDGE_WS_URL = 'ws://127.0.0.1:8787/ws';

const PRESET_COMMANDS = [
  {
    label: 'Ping',
    command: JSON.stringify({ type: 'ping', request_id: 'gui-1' }, null, 2),
  },
  {
    label: '获取状态',
    command: JSON.stringify({ type: 'get_status', request_id: 'gui-2' }, null, 2),
  },
  {
    label: '获取控制台错误',
    command: JSON.stringify({ type: 'get_console_errors', request_id: 'gui-3' }, null, 2),
  },
  {
    label: '获取会话',
    command: JSON.stringify({ type: 'get_sessions', request_id: 'gui-4' }, null, 2),
  },
  {
    label: '人工验证任务',
    command: JSON.stringify(
      {
        type: 'validation_request_human_action',
        request_id: 'gui-5',
        payload: {
          task: {
            task_id: 'demo-task-001',
            trace_id: 'demo-trace-001',
            title: '验证登录流程',
            steps: [
              {
                step_id: 'step-1',
                type: 'click',
                instruction: '点击登录按钮',
                expected: '跳转到首页',
                selector_hint: '#login-btn',
                target: null,
              },
              {
                step_id: 'step-2',
                type: 'input',
                instruction: '输入用户名 admin',
                expected: '输入框显示 admin',
                selector_hint: '#username',
                target: null,
              },
            ],
          },
        },
      },
      null,
      2,
    ),
  },
  {
    label: '收集证据包',
    command: JSON.stringify(
      {
        type: 'validation_collect_trace_bundle',
        request_id: 'gui-6',
        payload: { task_id: 'demo-task-001', level: 'summary' },
      },
      null,
      2,
    ),
  },
];

export default function BridgePanel() {
  const [wsStatus, setWsStatus] = useState<WsStatus>('disconnected');
  const [command, setCommand] = useState(PRESET_COMMANDS[0].command);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [wsUrl, setWsUrl] = useState(BRIDGE_WS_URL);
  const wsRef = useRef<WebSocket | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  const now = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });

  const addHistory = useCallback((dir: 'send' | 'recv', data: string) => {
    setHistory((prev) => {
      const next = [...prev, { dir, ts: now(), data }];
      if (next.length > 200) next.splice(0, next.length - 200);
      return next;
    });
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setWsStatus('connecting');
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      setWsStatus('connected');
      addHistory('recv', '[连接成功]');
    };
    ws.onclose = () => {
      setWsStatus('disconnected');
      wsRef.current = null;
    };
    ws.onerror = () => {
      setWsStatus('disconnected');
      message.error('WebSocket 连接失败');
    };
    ws.onmessage = (ev) => {
      addHistory('recv', typeof ev.data === 'string' ? ev.data : '[binary]');
    };
    wsRef.current = ws;
  }, [wsUrl, addHistory]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setWsStatus('disconnected');
  }, []);

  const send = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      message.warning('WebSocket 未连接');
      return;
    }
    const trimmed = command.trim();
    if (!trimmed) return;
    try {
      JSON.parse(trimmed);
    } catch {
      message.error('JSON 格式不正确');
      return;
    }
    wsRef.current.send(trimmed);
    addHistory('send', trimmed);
  }, [command, addHistory]);

  const clearHistory = useCallback(() => setHistory([]), []);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [history]);

  const statusTag = (() => {
    switch (wsStatus) {
      case 'connected':
        return <Tag color="green">已连接</Tag>;
      case 'connecting':
        return <Tag color="blue">连接中...</Tag>;
      default:
        return <Tag color="red">未连接</Tag>;
    }
  })();

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card title="Bridge 连接" size="small">
        <Space wrap>
          {statusTag}
          <Input
            value={wsUrl}
            onChange={(e) => setWsUrl(e.target.value)}
            style={{ width: 260 }}
            disabled={wsStatus === 'connected'}
          />
          <Button
            type="primary"
            icon={<LinkOutlined />}
            onClick={connect}
            disabled={wsStatus === 'connected' || wsStatus === 'connecting'}
          >
            连接
          </Button>
          <Button
            danger
            icon={<DisconnectOutlined />}
            onClick={disconnect}
            disabled={wsStatus === 'disconnected'}
          >
            断开
          </Button>
        </Space>
      </Card>

      <Card title="发送命令" size="small">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space wrap>
            <Text>预设命令：</Text>
            <Select
              style={{ width: 200 }}
              placeholder="选择预设命令"
              onChange={(_, option) => {
                setCommand((option as { value: string }).value);
              }}
              options={PRESET_COMMANDS.map((c) => ({
                label: c.label,
                value: c.command,
              }))}
            />
          </Space>
          <TextArea
            rows={8}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: 13 }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={send}
            disabled={wsStatus !== 'connected'}
          >
            发送
          </Button>
        </Space>
      </Card>

      <Card
        title="消息记录"
        size="small"
        extra={
          <Button icon={<ClearOutlined />} size="small" onClick={clearHistory}>
            清空
          </Button>
        }
      >
        <div
          ref={historyRef}
          style={{
            height: 320,
            overflowY: 'auto',
            background: '#1e1e1e',
            borderRadius: 6,
            padding: 12,
            fontFamily: 'monospace',
            fontSize: 12,
          }}
        >
          {history.length === 0 && (
            <Text type="secondary" style={{ color: '#666' }}>
              暂无消息
            </Text>
          )}
          {history.map((entry, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <span style={{ color: '#888', marginRight: 8 }}>{entry.ts}</span>
              <span
                style={{
                  color: entry.dir === 'send' ? '#73d13d' : '#4096ff',
                  marginRight: 8,
                }}
              >
                {entry.dir === 'send' ? '>>>' : '<<<'}
              </span>
              <span style={{ color: '#d4d4d4', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(entry.data), null, 2);
                  } catch {
                    return entry.data;
                  }
                })()}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </Space>
  );
}
