import React from 'react';
import { Button, Card, Descriptions, Input, List, Select, Space, Tag, Typography } from 'antd';
import { ApiOutlined } from '@ant-design/icons';
import type { BridgeSession, ConsoleErrorItem, RuntimeStatus } from '../types';

type Props = {
  status: string;
  runtime: RuntimeStatus;
  lastErrorFetchAt: string;
  errorItems: ConsoleErrorItem[];
  bridgeSessions: BridgeSession[];
  selectedTabKey: string;
  onSelectTab: (v: string) => void;
  onPing: () => void;
  onFetchErrors: () => void;
};

function getBridgeStartCmd() {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('windows')) return 'wujie-mcp-bridge.exe';
  return './wujie-mcp-bridge';
}

export function ObserveTab(props: Props) {
  const {
    status,
    runtime,
    lastErrorFetchAt,
    errorItems,
    bridgeSessions,
    selectedTabKey,
    onSelectTab,
    onPing,
    onFetchErrors
  } = props;

  const bridgeStartCmd = React.useMemo(() => getBridgeStartCmd(), []);

  const tabOptions = React.useMemo(() => {
    const ids = new Set<string>();
    for (const item of errorItems) ids.add(String(item.tab_id ?? 'unknown'));
    return [{ label: 'All Tabs', value: 'all' }, ...Array.from(ids).map((id) => ({ label: `Tab ${id}`, value: id }))];
  }, [errorItems]);

  const filteredErrors = React.useMemo(() => {
    if (selectedTabKey === 'all') return errorItems;
    return errorItems.filter((item) => String(item.tab_id ?? 'unknown') === selectedTabKey);
  }, [errorItems, selectedTabKey]);

  const copyBridgeCmd = async () => {
    await navigator.clipboard.writeText(bridgeStartCmd);
  };

  return (
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

      {!runtime.wsConnected ? (
        <Card size="small" title="Bridge 未启动" style={{ borderColor: '#f59e0b' }}>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Typography.Text type="secondary">请先运行已分发的 bridge 可执行文件（无需 Rust 环境）。</Typography.Text>
            <Input value={bridgeStartCmd} readOnly />
            <Typography.Text type="secondary">开发模式命令：`cargo run -p rust-bridge`</Typography.Text>
            <Button onClick={() => void copyBridgeCmd()} block>复制启动命令</Button>
          </Space>
        </Card>
      ) : null}

      <Button type="primary" icon={<ApiOutlined />} onClick={onPing} block>Ping Background</Button>
      <Button onClick={onFetchErrors} block>Fetch Console Errors</Button>
      <Card size="small" title={`Latest Errors (${filteredErrors.length})`}>
        <Space style={{ marginBottom: 8, width: '100%' }}>
          <Typography.Text type="secondary">Session</Typography.Text>
          <Select value={selectedTabKey} onChange={onSelectTab} options={tabOptions} style={{ minWidth: 160 }} size="small" />
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
  );
}
