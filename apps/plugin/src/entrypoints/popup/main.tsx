import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Card, Descriptions, Input, List, Select, Space, Tag, Typography } from 'antd';
import { ApiOutlined } from '@ant-design/icons';
import 'antd/dist/reset.css';

type RuntimeStatus = {
  wsConnected: boolean;
  currentTabUrl: string | null;
  recentConsoleErrorCount: number;
  sessions?: BridgeSession[];
  lastSyncResult?: SyncResult | null;
};

type ConsoleErrorItem = {
  message: string;
  url?: string | null;
  tab_id?: number | null;
  ts?: number;
};

type BridgeSession = {
  tab_id: number;
  url: string;
  last_seen_ts: number;
  error_count: number;
};

type SyncResult = {
  mode: 'all' | 'current';
  key: string;
  value: string;
  success: number;
  failed: number;
  at: number;
};

function App() {
  const [status, setStatus] = React.useState('idle');
  const [runtime, setRuntime] = React.useState<RuntimeStatus>({
    wsConnected: false,
    currentTabUrl: null,
    recentConsoleErrorCount: 0
  });
  const [lastErrorFetchAt, setLastErrorFetchAt] = React.useState<string>('-');
  const [errorItems, setErrorItems] = React.useState<ConsoleErrorItem[]>([]);
  const [bridgeSessions, setBridgeSessions] = React.useState<BridgeSession[]>([]);
  const [syncMode, setSyncMode] = React.useState<'all' | 'current'>('current');
  const [syncKey, setSyncKey] = React.useState('wujie-ai-sync-key');
  const [syncValue, setSyncValue] = React.useState('demo-value');
  const [syncResult, setSyncResult] = React.useState<SyncResult | null>(null);
  const [selectedTabKey, setSelectedTabKey] = React.useState<string>('all');

  const tabOptions = React.useMemo(() => {
    const ids = new Set<string>();
    for (const item of errorItems) {
      ids.add(String(item.tab_id ?? 'unknown'));
    }
    const options = [{ label: 'All Tabs', value: 'all' }];
    for (const id of Array.from(ids)) {
      options.push({ label: `Tab ${id}`, value: id });
    }
    return options;
  }, [errorItems]);

  const filteredErrors = React.useMemo(() => {
    if (selectedTabKey === 'all') {
      return errorItems;
    }
    return errorItems.filter((item) => String(item.tab_id ?? 'unknown') === selectedTabKey);
  }, [errorItems, selectedTabKey]);

  const sessionSummaries = React.useMemo(() => {
    const bucket = new Map<
      string,
      { tabKey: string; count: number; lastTs: number; url: string }
    >();
    for (const item of errorItems) {
      const tabKey = String(item.tab_id ?? 'unknown');
      const prev = bucket.get(tabKey);
      const ts = item.ts ?? 0;
      const url = item.url ?? '-';
      if (!prev) {
        bucket.set(tabKey, { tabKey, count: 1, lastTs: ts, url });
      } else {
        prev.count += 1;
        if (ts > prev.lastTs) {
          prev.lastTs = ts;
          prev.url = url;
        }
      }
    }
    return Array.from(bucket.values()).sort((a, b) => b.lastTs - a.lastTs);
  }, [errorItems]);

  const refreshStatus = React.useCallback(async () => {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
      if (res?.ok && res?.payload) {
        setRuntime(res.payload as RuntimeStatus);
        if (Array.isArray(res.payload.errorItems)) {
          setErrorItems(res.payload.errorItems as ConsoleErrorItem[]);
        }
        if (Array.isArray(res.payload.sessions)) {
          setBridgeSessions(res.payload.sessions as BridgeSession[]);
        }
        if (res.payload.lastSyncResult) {
          setSyncResult(res.payload.lastSyncResult as SyncResult);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    void refreshStatus();
    const timer = setInterval(() => {
      void refreshStatus();
    }, 1000);
    const listener = (message: unknown) => {
      const m = message as {
        type?: string;
        payload?: RuntimeStatus & {
          errorItems?: ConsoleErrorItem[];
          sessions?: BridgeSession[];
          lastSyncResult?: SyncResult | null;
        };
      };
      if (m?.type === 'STATUS_PUSH' && m.payload) {
        setRuntime({
          wsConnected: m.payload.wsConnected,
          currentTabUrl: m.payload.currentTabUrl,
          recentConsoleErrorCount: m.payload.recentConsoleErrorCount
        });
        if (Array.isArray(m.payload.errorItems)) {
          setErrorItems(m.payload.errorItems);
        }
        if (Array.isArray(m.payload.sessions)) {
          setBridgeSessions(m.payload.sessions);
        }
        if (m.payload.lastSyncResult) {
          setSyncResult(m.payload.lastSyncResult);
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      clearInterval(timer);
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [refreshStatus]);

  const ping = async () => {
    setStatus('pinging...');
    try {
      const res = await chrome.runtime.sendMessage({ type: 'PING' });
      setStatus(res?.ok ? `ok @ ${new Date(res.ts).toLocaleTimeString()}` : 'failed');
    } catch {
      setStatus('error');
    }
  };

  const fetchErrors = async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'GET_CONSOLE_ERRORS' });
      await refreshStatus();
      setLastErrorFetchAt(new Date().toLocaleTimeString());
    } catch {
      setLastErrorFetchAt('failed');
    }
  };

  const runSyncData = async () => {
    const res = await chrome.runtime.sendMessage({
      type: 'SYNC_DATA',
      payload: {
        mode: syncMode,
        key: syncKey,
        value: syncValue
      }
    });
    if (res?.ok && res.payload) {
      setSyncResult(res.payload as SyncResult);
    }
  };

  return (
    <main style={{ padding: 12, width: 420, background: '#f5f7fa' }}>
      <Card size="small" title="Wujie AI Sensing">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">Runtime bridge health check</Typography.Text>
          <Tag color={status.startsWith('ok') ? 'success' : 'default'}>{status}</Tag>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="WS Connected">
              <Tag color={runtime.wsConnected ? 'success' : 'warning'}>
                {runtime.wsConnected ? 'Connected' : 'Disconnected'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Current Tab">
              <Typography.Text ellipsis style={{ maxWidth: 200 }}>
                {runtime.currentTabUrl ?? '-'}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="Recent Errors">
              <Tag color={runtime.recentConsoleErrorCount > 0 ? 'error' : 'success'}>
                {runtime.recentConsoleErrorCount}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Fetch Errors At">{lastErrorFetchAt}</Descriptions.Item>
          </Descriptions>
          <Button type="primary" icon={<ApiOutlined />} onClick={ping} block>
            Ping Background
          </Button>
          <Button onClick={fetchErrors} block>
            Fetch Console Errors
          </Button>
          <Card size="small" title={`Latest Errors (${filteredErrors.length})`}>
            <Space style={{ marginBottom: 8, width: '100%' }}>
              <Typography.Text type="secondary">Session</Typography.Text>
              <Select
                value={selectedTabKey}
                onChange={setSelectedTabKey}
                options={tabOptions}
                style={{ minWidth: 160 }}
                size="small"
              />
            </Space>
            <List
              size="small"
              dataSource={filteredErrors}
              locale={{ emptyText: 'No errors fetched yet' }}
              renderItem={(item) => (
                <List.Item>
                  <Space direction="vertical" size={2} style={{ width: '100%' }}>
                    <Typography.Text strong ellipsis>
                      {item.message}
                    </Typography.Text>
                    <Typography.Text type="secondary" ellipsis style={{ maxWidth: 280 }}>
                      {item.url ?? '-'}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      tab={item.tab_id ?? '-'} |{' '}
                      {item.ts ? new Date(item.ts).toLocaleTimeString() : '-'}
                    </Typography.Text>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
          <Card size="small" title="Session Summary">
            <List
              size="small"
              dataSource={sessionSummaries}
              locale={{ emptyText: 'No sessions yet' }}
              renderItem={(item) => (
                <List.Item>
                  <Space direction="vertical" size={2} style={{ width: '100%' }}>
                    <Typography.Text strong>
                      Tab {item.tabKey} · {item.count} errors
                    </Typography.Text>
                    <Typography.Text type="secondary" ellipsis style={{ maxWidth: 320 }}>
                      {item.url}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      last at {item.lastTs ? new Date(item.lastTs).toLocaleTimeString() : '-'}
                    </Typography.Text>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
          <Card size="small" title="Bridge Sessions">
            <List
              size="small"
              dataSource={[...bridgeSessions].sort((a, b) => b.last_seen_ts - a.last_seen_ts)}
              locale={{ emptyText: 'No bridge sessions yet' }}
              renderItem={(item) => (
                <List.Item>
                  <Space direction="vertical" size={2} style={{ width: '100%' }}>
                    <Typography.Text strong>
                      Tab {item.tab_id} · {item.error_count} errors
                    </Typography.Text>
                    <Typography.Text type="secondary" ellipsis style={{ maxWidth: 320 }}>
                      {item.url}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      last seen {item.last_seen_ts ? new Date(item.last_seen_ts).toLocaleTimeString() : '-'}
                    </Typography.Text>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
          <Card size="small" title="Sync Data">
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Select
                value={syncMode}
                onChange={(v) => setSyncMode(v)}
                options={[
                  { label: 'Current Tab', value: 'current' },
                  { label: 'All Tabs', value: 'all' }
                ]}
                size="small"
              />
              <Input size="small" value={syncKey} onChange={(e) => setSyncKey(e.target.value)} placeholder="key" />
              <Input size="small" value={syncValue} onChange={(e) => setSyncValue(e.target.value)} placeholder="value" />
              <Button onClick={runSyncData} block>
                Sync localStorage
              </Button>
              {syncResult ? (
                <Typography.Text type="secondary">
                  {syncResult.mode} · success {syncResult.success} · failed {syncResult.failed} ·{' '}
                  {new Date(syncResult.at).toLocaleTimeString()}
                </Typography.Text>
              ) : null}
            </Space>
          </Card>
        </Space>
      </Card>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
