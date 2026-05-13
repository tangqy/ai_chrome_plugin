import React from 'react';
import { Button, Input, List, Select, Space, Switch, Tag, Typography } from 'antd';
import type { NetworkEntry } from '../../types';

type Props = {
  entries: NetworkEntry[];
  onClear: () => void;
  onCreateMockFromEntry: (entry: NetworkEntry) => void;
};

function shellEscape(s: string): string {
  return s.replace(/"/g, '\\"').replace(/'/g, `'"'"'`);
}

function entryToCurl(entry: NetworkEntry): string {
  let cmd = `curl -X ${shellEscape(entry.method)} '${shellEscape(entry.url)}'`;
  for (const [k, v] of Object.entries(entry.headers ?? {})) cmd += ` -H '${shellEscape(k)}: ${shellEscape(String(v))}'`;
  if (entry.postData) cmd += ` --data '${shellEscape(entry.postData)}'`;
  return cmd;
}

export function NetworkLogSection({ entries, onClear, onCreateMockFromEntry }: Props) {
  const [keyword, setKeyword] = React.useState('');
  const [methodFilter, setMethodFilter] = React.useState('ALL');
  const [onlyXhrFetch, setOnlyXhrFetch] = React.useState(true);
  const [timeRange, setTimeRange] = React.useState<'1m' | '5m' | 'all'>('5m');
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const methods = React.useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) set.add(e.method.toUpperCase());
    return ['ALL', ...Array.from(set).sort()];
  }, [entries]);

  const filtered = React.useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const now = Date.now();
    const minTs = timeRange === '1m' ? now - 60_000 : timeRange === '5m' ? now - 5 * 60_000 : 0;
    return entries
      .slice()
      .reverse()
      .filter((e) => e.ts >= minTs)
      .filter((e) => (methodFilter === 'ALL' ? true : e.method.toUpperCase() === methodFilter))
      .filter((e) => (onlyXhrFetch ? ['XHR', 'FETCH'].includes((e.resourceType ?? '').toUpperCase()) : true))
      .filter((e) => (kw ? e.url.toLowerCase().includes(kw) : true));
  }, [entries, keyword, methodFilter, onlyXhrFetch, timeRange]);

  const copyOne = async (entry: NetworkEntry) => navigator.clipboard.writeText(entryToCurl(entry));

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Text strong>Network 日志中心</Typography.Text>
        <Button size="small" danger onClick={onClear}>清空记录</Button>
      </Space>
      <Space>
        <Typography.Text type="secondary">仅 XHR/Fetch</Typography.Text>
        <Switch size="small" checked={onlyXhrFetch} onChange={setOnlyXhrFetch} />
        <Select size="small" value={timeRange} style={{ width: 120 }} onChange={(v) => setTimeRange(v)} options={[{ label: '近 1 分钟', value: '1m' }, { label: '近 5 分钟', value: '5m' }, { label: '全部', value: 'all' }]} />
      </Space>
      <Space wrap>
        {methods.map((m) => (
          <Tag key={m} color={methodFilter === m ? 'blue' : 'default'} style={{ cursor: 'pointer' }} onClick={() => setMethodFilter(m)}>{m}</Tag>
        ))}
      </Space>
      <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="按 URL 关键字筛选" />
      <List
        size="small"
        bordered
        locale={{ emptyText: '暂无记录' }}
        style={{ maxHeight: 260, overflow: 'auto', background: '#fff' }}
        dataSource={filtered}
        renderItem={(item) => {
          const expanded = expandedId === item.id;
          return (
            <List.Item actions={[
              <Button key="mk" size="small" onClick={() => onCreateMockFromEntry(item)}>生成Mock</Button>,
              <Button key="detail" size="small" onClick={() => setExpandedId(expanded ? null : item.id)}>{expanded ? '收起' : '详情'}</Button>,
              <Button key="copy" size="small" onClick={() => void copyOne(item)}>复制 cURL</Button>
            ]}>
              <Space direction="vertical" size={2} style={{ maxWidth: 300 }}>
                <Space size={6}><Typography.Text strong>{item.method}</Typography.Text><Tag>{item.resourceType ?? 'UNKNOWN'}</Tag></Space>
                <Typography.Text ellipsis={{ tooltip: item.url }} style={{ maxWidth: 280 }}>{item.url}</Typography.Text>
                <Typography.Text type="secondary">{new Date(item.ts).toLocaleTimeString()}</Typography.Text>
                {expanded ? (
                  <pre style={{ margin: 0, padding: 8, background: '#f8fafc', borderRadius: 6, maxWidth: 280, overflow: 'auto', fontSize: 11 }}>
                    {JSON.stringify(
                      {
                        statusCode: item.statusCode,
                        requestHeaders: item.headers,
                        requestBody: item.postData ?? '',
                        responseHeaders: item.responseHeaders ?? {},
                        responseMimeType: item.responseMimeType,
                        responseBody: item.responseBody ?? ''
                      },
                      null,
                      2
                    )}
                  </pre>
                ) : null}
              </Space>
            </List.Item>
          );
        }}
      />
    </Space>
  );
}
