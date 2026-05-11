import React from 'react';
import { createRoot } from 'react-dom/client';
import { Card, Space, Tabs } from 'antd';
import 'antd/dist/reset.css';

import { useRuntimeStatus } from './hooks/useRuntimeStatus';
import { ObserveTab } from './tabs/ObserveTab';
import { SyncTab } from './tabs/SyncTab';
import { ToolboxTab } from './tabs/ToolboxTab';

function App() {
  const { state, setSyncResult, setDomainSyncResult, refreshStatus } = useRuntimeStatus();
  const { runtime, errorItems, bridgeSessions, syncResult, domainSyncResult, automationTasks } = state;

  const [status, setStatus] = React.useState('idle');
  const [lastErrorFetchAt, setLastErrorFetchAt] = React.useState('-');
  const [selectedTabKey, setSelectedTabKey] = React.useState('all');
  const [sourceDomain, setSourceDomain] = React.useState('react_web');
  const [curlOutput, setCurlOutput] = React.useState('');

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

  const runDomainSync = async () => {
    const res = await chrome.runtime.sendMessage({
      type: 'SYNC_FROM_SOURCE_DOMAIN',
      payload: { sourceDomain }
    });
    if (res?.ok && res.payload) setDomainSyncResult(res.payload);
  };

  const setProxy = async (mode: 'system' | 'direct') => {
    const res = await chrome.runtime.sendMessage({ type: 'PROXY_SET_MODE', payload: { mode } });
    if (res?.ok) await refreshStatus();
  };

  const setNetworkRecording = async (enabled: boolean) => {
    await chrome.runtime.sendMessage({ type: 'NETWORK_RECORDING_SET', payload: { enabled } });
    await refreshStatus();
  };

  const exportNetworkCurl = async () => {
    const res = await chrome.runtime.sendMessage({ type: 'NETWORK_RECORDING_EXPORT_CURL' });
    if (res?.ok && res.payload?.ok) setCurlOutput(String(res.payload.output ?? ''));
    else setCurlOutput(`导出失败: ${String(res?.error ?? res?.payload?.error ?? 'unknown')}`);
  };

  const upsertTask = async (name: string, cron: string, script: string) => {
    await chrome.runtime.sendMessage({
      type: 'AUTOMATION_UPSERT',
      payload: { id: name, name, cron, script, enabled: true }
    });
    await refreshStatus();
  };

  const deleteTask = async (id: string) => {
    await chrome.runtime.sendMessage({ type: 'AUTOMATION_DELETE', payload: { id } });
    await refreshStatus();
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
                <ObserveTab
                  status={status}
                  runtime={runtime}
                  lastErrorFetchAt={lastErrorFetchAt}
                  errorItems={errorItems}
                  bridgeSessions={bridgeSessions}
                  selectedTabKey={selectedTabKey}
                  onSelectTab={setSelectedTabKey}
                  onPing={() => void ping()}
                  onFetchErrors={() => void fetchErrors()}
                />
              )
            },
            {
              key: 'sync-domain',
              label: '同步数据',
              children: (
                <SyncTab
                  runtime={runtime}
                  sourceDomain={sourceDomain}
                  onChangeSourceDomain={setSourceDomain}
                  domainSyncResult={domainSyncResult}
                  onRunDomainSync={() => void runDomainSync()}
                />
              )
            },
            {
              key: 'tools',
              label: '工具箱',
              children: (
                <ToolboxTab
                  runtimeConnected={runtime.wsConnected}
                  proxyMode={runtime.proxyMode ?? 'system'}
                  networkRecordingEnabled={Boolean(runtime.networkRecordingEnabled)}
                  networkEntryCount={Number(runtime.networkEntryCount ?? 0)}
                  automationTasks={automationTasks}
                  onSetProxy={(mode) => void setProxy(mode)}
                  onSetNetworkRecording={(enabled) => void setNetworkRecording(enabled)}
                  onExportNetworkCurl={() => void exportNetworkCurl()}
                  curlOutput={curlOutput}
                  onUpsertTask={(name, cron, script) => void upsertTask(name, cron, script)}
                  onDeleteTask={(id) => void deleteTask(id)}
                />
              )
            }
          ]}
        />
      </Card>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
