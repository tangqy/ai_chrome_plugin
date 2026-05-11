import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  Button,
  Card,
  Descriptions,
  Input,
  List,
  Select,
  Space,
  Tabs,
  Tag,
  Typography
} from 'antd';
import { ApiOutlined } from '@ant-design/icons';
import QRCode from 'qrcode';
import 'antd/dist/reset.css';

type RuntimeStatus = {
  wsConnected: boolean;
  currentTabUrl: string | null;
  recentConsoleErrorCount: number;
  sessions?: BridgeSession[];
  lastSyncResult?: SyncResult | null;
  lastDomainSyncResult?: DomainSyncResult | null;
  automationTasks?: AutomationTask[];
  proxyMode?: 'system' | 'direct';
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

type DomainSyncResult = {
  sourceDomain: string;
  targetUrl: string;
  localStorageKeys: number;
  cookiesCopied: number;
  failed: number;
  at: number;
};

type AutomationTask = {
  id: string;
  name: string;
  cron: string;
  script: string;
  enabled: boolean;
  lastRunAt?: number;
  lastResult?: string;
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
  const [sourceDomain, setSourceDomain] = React.useState('react_web');
  const [domainSyncResult, setDomainSyncResult] = React.useState<DomainSyncResult | null>(null);
  const [automationTasks, setAutomationTasks] = React.useState<AutomationTask[]>([]);

  const [unicodeInput, setUnicodeInput] = React.useState('\\u4f60\\u597d');
  const [unicodeOutput, setUnicodeOutput] = React.useState('');
  const [qrUrl, setQrUrl] = React.useState('https://example.com');
  const [qrDataUrl, setQrDataUrl] = React.useState('');
  const [jsonInput, setJsonInput] = React.useState('{"a":1,"b":[2,3]}');
  const [jsonOutput, setJsonOutput] = React.useState('');
  const [diffLeft, setDiffLeft] = React.useState('line1\nline2\nline3');
  const [diffRight, setDiffRight] = React.useState('line1\nlineX\nline3');
  const [diffOutput, setDiffOutput] = React.useState('');
  const [tsInput, setTsInput] = React.useState(String(Date.now()));
  const [timeOutput, setTimeOutput] = React.useState('');
  const [taskName, setTaskName] = React.useState('demo-task');
  const [taskCron, setTaskCron] = React.useState('*/5 * * * *');
  const [taskScript, setTaskScript] = React.useState("return 'ok';");
  const [proxyMode, setProxyMode] = React.useState<'system' | 'direct'>('system');

  const tabOptions = React.useMemo(() => {
    const ids = new Set<string>();
    for (const item of errorItems) ids.add(String(item.tab_id ?? 'unknown'));
    return [{ label: 'All Tabs', value: 'all' }, ...Array.from(ids).map((id) => ({ label: `Tab ${id}`, value: id }))];
  }, [errorItems]);

  const filteredErrors = React.useMemo(() => {
    if (selectedTabKey === 'all') return errorItems;
    return errorItems.filter((item) => String(item.tab_id ?? 'unknown') === selectedTabKey);
  }, [errorItems, selectedTabKey]);

  const sessionSummaries = React.useMemo(() => {
    const bucket = new Map<string, { tabKey: string; count: number; lastTs: number; url: string }>();
    for (const item of errorItems) {
      const tabKey = String(item.tab_id ?? 'unknown');
      const prev = bucket.get(tabKey);
      const ts = item.ts ?? 0;
      const url = item.url ?? '-';
      if (!prev) bucket.set(tabKey, { tabKey, count: 1, lastTs: ts, url });
      else {
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
        if (Array.isArray(res.payload.errorItems)) setErrorItems(res.payload.errorItems as ConsoleErrorItem[]);
        if (Array.isArray(res.payload.sessions)) setBridgeSessions(res.payload.sessions as BridgeSession[]);
        if (res.payload.lastSyncResult) setSyncResult(res.payload.lastSyncResult as SyncResult);
        if (res.payload.lastDomainSyncResult) setDomainSyncResult(res.payload.lastDomainSyncResult as DomainSyncResult);
        if (Array.isArray(res.payload.automationTasks)) setAutomationTasks(res.payload.automationTasks as AutomationTask[]);
        if (res.payload.proxyMode === 'direct' || res.payload.proxyMode === 'system') {
          setProxyMode(res.payload.proxyMode);
        }
      }
    } catch {}
  }, []);

  React.useEffect(() => {
    void refreshStatus();
    const timer = setInterval(() => void refreshStatus(), 1000);
    const listener = (message: unknown) => {
      const m = message as {
        type?: string;
        payload?: RuntimeStatus & {
          errorItems?: ConsoleErrorItem[];
          sessions?: BridgeSession[];
          lastSyncResult?: SyncResult | null;
          lastDomainSyncResult?: DomainSyncResult | null;
          automationTasks?: AutomationTask[];
          proxyMode?: 'system' | 'direct';
        };
      };
      if (m?.type === 'STATUS_PUSH' && m.payload) {
        setRuntime({
          wsConnected: m.payload.wsConnected,
          currentTabUrl: m.payload.currentTabUrl,
          recentConsoleErrorCount: m.payload.recentConsoleErrorCount
        });
        if (Array.isArray(m.payload.errorItems)) setErrorItems(m.payload.errorItems);
        if (Array.isArray(m.payload.sessions)) setBridgeSessions(m.payload.sessions);
        if (m.payload.lastSyncResult) setSyncResult(m.payload.lastSyncResult);
        if (m.payload.lastDomainSyncResult) setDomainSyncResult(m.payload.lastDomainSyncResult);
        if (Array.isArray(m.payload.automationTasks)) setAutomationTasks(m.payload.automationTasks);
        if (m.payload.proxyMode === 'direct' || m.payload.proxyMode === 'system') {
          setProxyMode(m.payload.proxyMode);
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
    const res = await chrome.runtime.sendMessage({ type: 'SYNC_DATA', payload: { mode: syncMode, key: syncKey, value: syncValue } });
    if (res?.ok && res.payload) setSyncResult(res.payload as SyncResult);
  };

  const runDomainSync = async () => {
    const res = await chrome.runtime.sendMessage({ type: 'SYNC_FROM_SOURCE_DOMAIN', payload: { sourceDomain } });
    if (res?.ok && res.payload) setDomainSyncResult(res.payload as DomainSyncResult);
  };

  const decodeUnicode = () => {
    try {
      setUnicodeOutput(unicodeInput.replace(/\\u([0-9a-fA-F]{4})/g, (_, g1) => String.fromCharCode(parseInt(g1, 16))));
    } catch {
      setUnicodeOutput('解析失败');
    }
  };

  const formatJsonFast = React.useCallback(async () => {
    try {
      const localObj = JSON.parse(jsonInput);
      setJsonOutput(JSON.stringify(localObj, null, 2));
      if (!runtime.wsConnected) return;
      const res = await chrome.runtime.sendMessage({ type: 'FORMAT_JSON_FAST', payload: { input: jsonInput } });
      if (res?.ok && res.payload?.ok) setJsonOutput(String(res.payload.output ?? ''));
    } catch (err) {
      setJsonOutput(`JSON 格式错误: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }, [jsonInput, runtime.wsConnected]);

  React.useEffect(() => {
    const t = setTimeout(() => void formatJsonFast(), 180);
    return () => clearTimeout(t);
  }, [formatJsonFast]);

  React.useEffect(() => {
    void QRCode.toDataURL(qrUrl, { width: 180, margin: 1 })
      .then((url: string) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [qrUrl]);

  const diffFast = async () => {
    const a = diffLeft.split('\n');
    const b = diffRight.split('\n');
    const n = Math.max(a.length, b.length);
    const out: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const la = a[i] ?? '';
      const lb = b[i] ?? '';
      if (la === lb) out.push(`  ${la}`);
      else {
        if (la) out.push(`- ${la}`);
        if (lb) out.push(`+ ${lb}`);
      }
    }
    setDiffOutput(out.join('\n'));
    if (!runtime.wsConnected) return;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'DIFF_TEXT_FAST', payload: { left: diffLeft, right: diffRight } });
      if (res?.ok && res.payload?.ok) setDiffOutput(String(res.payload.output ?? ''));
    } catch {}
  };

  const convertTime = () => {
    const num = Number(tsInput);
    if (!Number.isFinite(num)) {
      setTimeOutput('无效时间戳');
      return;
    }
    const d = new Date(num < 1e12 ? num * 1000 : num);
    setTimeOutput(`${d.toISOString()} | ${d.toLocaleString()}`);
  };

  const upsertTask = async () => {
    await chrome.runtime.sendMessage({
      type: 'AUTOMATION_UPSERT',
      payload: { id: taskName, name: taskName, cron: taskCron, script: taskScript, enabled: true }
    });
    await refreshStatus();
  };

  const deleteTask = async (id: string) => {
    await chrome.runtime.sendMessage({ type: 'AUTOMATION_DELETE', payload: { id } });
    await refreshStatus();
  };

  const setProxy = async (mode: 'system' | 'direct') => {
    const res = await chrome.runtime.sendMessage({ type: 'PROXY_SET_MODE', payload: { mode } });
    if (res?.ok && res?.payload?.proxyMode) {
      setProxyMode(res.payload.proxyMode);
    }
  };

  return (
    <main style={{ padding: 12, width: 460, background: '#f5f7fa' }}>
      <Card size="small" title="Wujie AI Sensing">
        <Tabs
          size="small"
          items={[
            {
              key: 'observe',
              label: '观测面板',
              children: (
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
                      <Typography.Text ellipsis style={{ maxWidth: 220 }}>{runtime.currentTabUrl ?? '-'}</Typography.Text>
                    </Descriptions.Item>
                    <Descriptions.Item label="Recent Errors">
                      <Tag color={runtime.recentConsoleErrorCount > 0 ? 'error' : 'success'}>{runtime.recentConsoleErrorCount}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="Fetch Errors At">{lastErrorFetchAt}</Descriptions.Item>
                  </Descriptions>
                  <Button type="primary" icon={<ApiOutlined />} onClick={ping} block>Ping Background</Button>
                  <Button onClick={fetchErrors} block>Fetch Console Errors</Button>
                  <Card size="small" title={`Latest Errors (${filteredErrors.length})`}>
                    <Space style={{ marginBottom: 8, width: '100%' }}>
                      <Typography.Text type="secondary">Session</Typography.Text>
                      <Select value={selectedTabKey} onChange={setSelectedTabKey} options={tabOptions} style={{ minWidth: 160 }} size="small" />
                    </Space>
                    <List
                      size="small"
                      dataSource={filteredErrors}
                      locale={{ emptyText: 'No errors fetched yet' }}
                      renderItem={(item) => (
                        <List.Item>
                          <Space direction="vertical" size={2} style={{ width: '100%' }}>
                            <Typography.Text strong ellipsis>{item.message}</Typography.Text>
                            <Typography.Text type="secondary" ellipsis style={{ maxWidth: 320 }}>{item.url ?? '-'}</Typography.Text>
                            <Typography.Text type="secondary">tab={item.tab_id ?? '-'} | {item.ts ? new Date(item.ts).toLocaleTimeString() : '-'}</Typography.Text>
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
                            <Typography.Text strong>Tab {item.tab_id} · {item.error_count} errors</Typography.Text>
                            <Typography.Text type="secondary" ellipsis style={{ maxWidth: 320 }}>{item.url}</Typography.Text>
                            <Typography.Text type="secondary">last seen {item.last_seen_ts ? new Date(item.last_seen_ts).toLocaleTimeString() : '-'}</Typography.Text>
                          </Space>
                        </List.Item>
                      )}
                    />
                  </Card>
                </Space>
              )
            },
            {
              key: 'sync-domain',
              label: '同步数据',
              children: (
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  <Typography.Text type="secondary">目标页面：当前活动页面（{runtime.currentTabUrl ?? '-'}）</Typography.Text>
                  <Input size="small" value={sourceDomain} onChange={(e) => setSourceDomain(e.target.value)} placeholder="输入源 tab 域名（例如 react_web 或 test.example.com）" />
                  <Button type="primary" onClick={runDomainSync} block>同步源域名数据到当前页面</Button>
                  {domainSyncResult ? (
                    <Card size="small" title="最近一次同步结果">
                      <Descriptions column={1} size="small" bordered>
                        <Descriptions.Item label="源域名">{domainSyncResult.sourceDomain}</Descriptions.Item>
                        <Descriptions.Item label="目标页面"><Typography.Text ellipsis style={{ maxWidth: 240 }}>{domainSyncResult.targetUrl}</Typography.Text></Descriptions.Item>
                        <Descriptions.Item label="localStorage Keys">{domainSyncResult.localStorageKeys}</Descriptions.Item>
                        <Descriptions.Item label="Cookies Copied">{domainSyncResult.cookiesCopied}</Descriptions.Item>
                        <Descriptions.Item label="Failed">{domainSyncResult.failed}</Descriptions.Item>
                        <Descriptions.Item label="时间">{new Date(domainSyncResult.at).toLocaleTimeString()}</Descriptions.Item>
                      </Descriptions>
                    </Card>
                  ) : null}
                </Space>
              )
            },
            {
              key: 'tools',
              label: '工具箱',
              children: (
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  <Card size="small" title="Unicode -> 中文">
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Input.TextArea value={unicodeInput} onChange={(e) => setUnicodeInput(e.target.value)} autoSize={{ minRows: 2, maxRows: 4 }} />
                      <Button onClick={decodeUnicode} block>转换</Button>
                      <Input.TextArea value={unicodeOutput} readOnly autoSize={{ minRows: 2, maxRows: 4 }} />
                    </Space>
                  </Card>
                  <Card size="small" title="网站二维码（离线）">
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Input value={qrUrl} onChange={(e) => setQrUrl(e.target.value)} placeholder="https://..." />
                      {qrDataUrl ? (
                        <img alt="qr" src={qrDataUrl} style={{ width: 180, height: 180, border: '1px solid #eee' }} />
                      ) : (
                        <Typography.Text type="secondary">二维码生成失败</Typography.Text>
                      )}
                    </Space>
                  </Card>
                  <Card size="small" title="JSON 格式化（离线优先，桥接增强）">
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Input.TextArea value={jsonInput} onChange={(e) => setJsonInput(e.target.value)} autoSize={{ minRows: 4, maxRows: 8 }} />
                      <Input.TextArea value={jsonOutput} readOnly autoSize={{ minRows: 4, maxRows: 10 }} />
                    </Space>
                  </Card>
                  <Card size="small" title="文件 Diff（离线优先，桥接增强）">
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Input.TextArea value={diffLeft} onChange={(e) => setDiffLeft(e.target.value)} autoSize={{ minRows: 3, maxRows: 8 }} placeholder="左侧内容" />
                      <Input.TextArea value={diffRight} onChange={(e) => setDiffRight(e.target.value)} autoSize={{ minRows: 3, maxRows: 8 }} placeholder="右侧内容" />
                      <Button onClick={() => void diffFast()} block>执行 Diff</Button>
                      <Input.TextArea value={diffOutput} readOnly autoSize={{ minRows: 4, maxRows: 10 }} />
                    </Space>
                  </Card>
                  <Card size="small" title="自动化任务（Cron + JS）">
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Input value={taskName} onChange={(e) => setTaskName(e.target.value)} placeholder="任务名" />
                      <Input value={taskCron} onChange={(e) => setTaskCron(e.target.value)} placeholder="cron: */5 * * * *" />
                      <Input.TextArea value={taskScript} onChange={(e) => setTaskScript(e.target.value)} autoSize={{ minRows: 2, maxRows: 5 }} placeholder="return 'ok';" />
                      <Button onClick={() => void upsertTask()} block>保存任务</Button>
                      <List
                        size="small"
                        dataSource={automationTasks}
                        locale={{ emptyText: '暂无任务' }}
                        renderItem={(task) => (
                          <List.Item actions={[<a key="del" onClick={() => void deleteTask(task.id)}>删除</a>]}> 
                            <Space direction="vertical" size={1}>
                              <Typography.Text strong>{task.name}</Typography.Text>
                              <Typography.Text type="secondary">{task.cron} | {task.lastRunAt ? new Date(task.lastRunAt).toLocaleTimeString() : '-'}</Typography.Text>
                              <Typography.Text type="secondary">{task.lastResult ?? '-'}</Typography.Text>
                            </Space>
                          </List.Item>
                        )}
                      />
                    </Space>
                  </Card>
                  <Card size="small" title="时间工具">
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Button onClick={() => setTsInput(String(Date.now()))} block>获取当前时间戳</Button>
                      <Input value={tsInput} onChange={(e) => setTsInput(e.target.value)} placeholder="输入时间戳（秒/毫秒）" />
                      <Button onClick={convertTime} block>时间戳转换</Button>
                      <Input.TextArea value={timeOutput} readOnly autoSize={{ minRows: 2, maxRows: 4 }} />
                    </Space>
                  </Card>
                  <Card size="small" title="代理切换">
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Typography.Text type="secondary">当前模式：{proxyMode === 'direct' ? '直连' : '系统代理'}</Typography.Text>
                      <Select
                        value={proxyMode}
                        onChange={(v) => void setProxy(v)}
                        options={[
                          { label: '系统代理', value: 'system' },
                          { label: '直连', value: 'direct' }
                        ]}
                      />
                    </Space>
                  </Card>
                </Space>
              )
            }
          ]}
        />
      </Card>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
