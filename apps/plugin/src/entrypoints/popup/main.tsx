import React from 'react';
import { createRoot } from 'react-dom/client';
import { Card, Tabs } from 'antd';
import 'antd/dist/reset.css';

import { useRuntimeStatus } from './hooks/useRuntimeStatus';
import { ObserveTab } from './tabs/ObserveTab';
import { SyncTab } from './tabs/SyncTab';
import { ToolboxTab } from './tabs/ToolboxTab';
import { MockTab } from './tabs/MockTab';
import type { NetworkEntry } from './types';

type MockDraft = {
  name: string;
  method: string;
  pathPattern: string;
  headers: Record<string, string>;
  postData?: string;
};

function App() {
  const POPUP_PREF_KEY = 'wujie_popup_prefs_v1';
  const { state, setDomainSyncResult, refreshStatus } = useRuntimeStatus();
  const { runtime, errorItems, bridgeSessions, domainSyncResult, automationTasks, mockRules, networkEntries } = state;

  const [status, setStatus] = React.useState('idle');
  const [lastErrorFetchAt, setLastErrorFetchAt] = React.useState('-');
  const [activeMainTab, setActiveMainTab] = React.useState('observe');
  const [selectedTabKey, setSelectedTabKey] = React.useState('all');
  const [sourceDomain, setSourceDomain] = React.useState('react_web');
  const [syncingDomain, setSyncingDomain] = React.useState(false);
  const [domainSyncError, setDomainSyncError] = React.useState('');
  const [curlOutput, setCurlOutput] = React.useState('');
  const [mockSeedDraft, setMockSeedDraft] = React.useState<MockDraft | null>(null);

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
    setSyncingDomain(true);
    setDomainSyncError('');
    try {
      const res = await chrome.runtime.sendMessage({ type: 'SYNC_FROM_SOURCE_DOMAIN', payload: { sourceDomain } });
      if (res?.ok && res.payload) {
        setDomainSyncResult(res.payload);
        return;
      }
      setDomainSyncError(String(res?.error ?? '同步失败'));
    } catch (err) {
      setDomainSyncError(err instanceof Error ? err.message : '同步失败');
    } finally {
      setSyncingDomain(false);
    }
  };

  const setBridgeLogTarget = async (target: 'terminal' | 'file' | 'both') => {
    const res = await chrome.runtime.sendMessage({ type: 'BRIDGE_LOG_TARGET_SET', payload: { target } });
    if (res?.ok) await refreshStatus();
  };

  const setProxy = async (mode: 'system' | 'direct') => {
    const res = await chrome.runtime.sendMessage({ type: 'PROXY_SET_MODE', payload: { mode } });
    if (res?.ok) await refreshStatus();
  };

  const setNetworkRecording = async (enabled: boolean) => {
    await chrome.runtime.sendMessage({ type: 'NETWORK_RECORDING_SET', payload: { enabled } });
    await refreshStatus();
  };

  const setNetworkRecordingFilter = async (filter: { pathKeyword: string; pathMatchMode: 'contains' | 'regex'; filterMode: 'all' | 'allow' | 'deny'; methods: string[]; resourceTypes: string[]; bodyPreviewLimit: '256kb' | '1mb' | '5mb' }) => {
    await chrome.runtime.sendMessage({ type: 'NETWORK_RECORDING_FILTER_SET', payload: filter });
    await refreshStatus();
  };

  const clearNetworkRecording = async () => {
    await chrome.runtime.sendMessage({ type: 'NETWORK_RECORDING_CLEAR' });
    await refreshStatus();
  };

  const exportNetworkCurl = async () => {
    const res = await chrome.runtime.sendMessage({ type: 'NETWORK_RECORDING_EXPORT_CURL' });
    if (res?.ok && res.payload?.ok) setCurlOutput(String(res.payload.output ?? ''));
    else setCurlOutput(`导出失败: ${String(res?.error ?? res?.payload?.error ?? 'unknown')}`);
  };

  const createMockFromEntry = async (entry: NetworkEntry) => {
    const res = await chrome.runtime.sendMessage({ type: 'MOCK_CREATE_FROM_NETWORK_ENTRY', payload: { entry } });
    if (res?.ok && res.payload?.draft) {
      setMockSeedDraft(res.payload.draft as MockDraft);
    }
  };

  const upsertTask = async (name: string, cron: string, script: string) => {
    await chrome.runtime.sendMessage({ type: 'AUTOMATION_UPSERT', payload: { id: name, name, cron, script, enabled: true } });
    await refreshStatus();
  };

  const deleteTask = async (id: string) => {
    await chrome.runtime.sendMessage({ type: 'AUTOMATION_DELETE', payload: { id } });
    await refreshStatus();
  };

  const upsertMockRule = async (payload: Record<string, unknown>) => {
    await chrome.runtime.sendMessage({ type: 'MOCK_RULES_UPSERT', payload: { ...payload, id: String(payload.id ?? payload.name ?? `mock-${Date.now()}`) } });
    await refreshStatus();
  };

  const deleteMockRule = async (id: string) => {
    await chrome.runtime.sendMessage({ type: 'MOCK_RULES_DELETE', payload: { id } });
    await refreshStatus();
  };

  const toggleMockRule = async (id: string, enabled: boolean) => {
    await chrome.runtime.sendMessage({ type: 'MOCK_RULES_TOGGLE', payload: { id, enabled } });
    await refreshStatus();
  };

  const importCurl = async (curl: string): Promise<MockDraft | null> => {
    const res = await chrome.runtime.sendMessage({ type: 'MOCK_IMPORT_CURL_PARSE', payload: { curl } });
    return res?.ok ? (res.payload?.draft as MockDraft) : null;
  };

  const previewRule = async (payload: Record<string, unknown>): Promise<string> => {
    const res = await chrome.runtime.sendMessage({ type: 'MOCK_RULE_PREVIEW_RESPONSE', payload });
    if (!res?.ok) return String(res?.error ?? 'preview failed');
    const p = res.payload;
    if (p?.ok) return typeof p.output === 'string' ? p.output : JSON.stringify(p.output, null, 2);
    return String(p?.error ?? 'preview failed');
  };

  React.useEffect(() => {
    void (async () => {
      try {
        const stored = await chrome.storage.local.get(POPUP_PREF_KEY);
        const prefs = stored?.[POPUP_PREF_KEY] as { activeMainTab?: string; selectedTabKey?: string; sourceDomain?: string } | undefined;
        if (prefs?.activeMainTab) setActiveMainTab(prefs.activeMainTab);
        if (prefs?.selectedTabKey) setSelectedTabKey(prefs.selectedTabKey);
        if (prefs?.sourceDomain) setSourceDomain(prefs.sourceDomain);
      } catch {}
    })();
  }, []);

  React.useEffect(() => {
    void chrome.storage.local
      .set({
        [POPUP_PREF_KEY]: { activeMainTab, selectedTabKey, sourceDomain }
      })
      .catch(() => {});
  }, [activeMainTab, selectedTabKey, sourceDomain]);

  React.useEffect(() => {
    if (activeMainTab !== 'observe') return;
    void chrome.runtime.sendMessage({ type: 'BRIDGE_CONNECT' }).catch(() => {});
  }, [activeMainTab]);

  return (
    <main style={{ padding: 12, width: 460, background: '#f5f7fa' }}>
      <Card size="small" title="Wujie AI Sensing">
        <Tabs
          size="small"
          activeKey={activeMainTab}
          onChange={(k) => setActiveMainTab(k)}
          items={[
            {
              key: 'observe',
              label: '观测面板',
              children: <ObserveTab status={status} runtime={runtime} lastErrorFetchAt={lastErrorFetchAt} errorItems={errorItems} bridgeSessions={bridgeSessions} selectedTabKey={selectedTabKey} onSelectTab={setSelectedTabKey} onPing={() => void ping()} onFetchErrors={() => void fetchErrors()} onSetBridgeLogTarget={(target) => void setBridgeLogTarget(target)} />
            },
            {
              key: 'sync-domain',
              label: '同步数据',
              children: <SyncTab runtime={runtime} sourceDomain={sourceDomain} onChangeSourceDomain={setSourceDomain} domainSyncResult={domainSyncResult} syncing={syncingDomain} syncError={domainSyncError} onRunDomainSync={() => void runDomainSync()} />
            },
            {
              key: 'tools',
              label: '工具箱',
              children: <ToolboxTab runtimeConnected={runtime.wsConnected} proxyMode={runtime.proxyMode ?? 'system'} networkRecordingEnabled={Boolean(runtime.networkRecordingEnabled)} networkEntryCount={Number(runtime.networkEntryCount ?? 0)} networkEntries={networkEntries} networkRecordingFilter={runtime.networkRecordingFilter ?? { pathKeyword: '', pathMatchMode: 'contains', filterMode: 'all', methods: [], resourceTypes: ['XHR'], bodyPreviewLimit: '256kb' }} automationTasks={automationTasks} onSetProxy={(mode) => void setProxy(mode)} onSetNetworkRecording={(enabled) => void setNetworkRecording(enabled)} onSetNetworkRecordingFilter={(filter) => void setNetworkRecordingFilter(filter)} onClearNetworkRecording={() => void clearNetworkRecording()} onExportNetworkCurl={() => void exportNetworkCurl()} onCreateMockFromEntry={(entry) => void createMockFromEntry(entry)} curlOutput={curlOutput} onUpsertTask={(name, cron, script) => void upsertTask(name, cron, script)} onDeleteTask={(id) => void deleteTask(id)} />
            },
            {
              key: 'mock',
              label: 'Mock 请求',
              children: <MockTab rules={mockRules} seedDraft={mockSeedDraft} onConsumeSeedDraft={() => setMockSeedDraft(null)} onImportCurl={importCurl} onPreviewRule={previewRule} onUpsertRule={(p) => void upsertMockRule(p)} onDeleteRule={(id) => void deleteMockRule(id)} onToggleRule={(id, enabled) => void toggleMockRule(id, enabled)} />
            }
          ]}
        />
      </Card>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
