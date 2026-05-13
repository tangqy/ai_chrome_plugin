import React from 'react';
import { Button, Card, Descriptions, Input, Space, Typography } from 'antd';
import type { DomainSyncResult, RuntimeStatus } from '../types';

type Props = {
  runtime: RuntimeStatus;
  sourceDomain: string;
  onChangeSourceDomain: (v: string) => void;
  domainSyncResult: DomainSyncResult | null;
  syncing: boolean;
  syncError: string;
  onRunDomainSync: () => void;
};

export function SyncTab(props: Props) {
  const { runtime, sourceDomain, onChangeSourceDomain, domainSyncResult, syncing, syncError, onRunDomainSync } = props;

  return (
    <Space direction="vertical" size={10} style={{ width: '100%' }}>
      <Typography.Text type="secondary">目标页面：当前活动页面（{runtime.currentTabUrl ?? '-'}）</Typography.Text>
      <Input
        size="small"
        value={sourceDomain}
        onChange={(e) => onChangeSourceDomain(e.target.value)}
        placeholder="输入源 tab 域名（例如 react_web 或 test.example.com）"
      />
      <Button type="primary" loading={syncing} onClick={onRunDomainSync} block>同步源域名数据到当前页面</Button>
      {syncError ? <Typography.Text type="danger">{syncError}</Typography.Text> : null}
      {domainSyncResult ? (
        <Card size="small" title="最近一次同步结果">
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="源域名">{domainSyncResult.sourceDomain}</Descriptions.Item>
            <Descriptions.Item label="目标页面">
              <Typography.Text ellipsis style={{ maxWidth: 240 }}>{domainSyncResult.targetUrl}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="localStorage Keys">{domainSyncResult.localStorageKeys}</Descriptions.Item>
            <Descriptions.Item label="Cookies Copied">{domainSyncResult.cookiesCopied}</Descriptions.Item>
            <Descriptions.Item label="Failed">{domainSyncResult.failed}</Descriptions.Item>
            <Descriptions.Item label="时间">{new Date(domainSyncResult.at).toLocaleTimeString()}</Descriptions.Item>
          </Descriptions>
        </Card>
      ) : null}
    </Space>
  );
}
