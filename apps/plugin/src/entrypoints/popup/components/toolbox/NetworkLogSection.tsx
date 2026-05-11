import React from 'react';
import { Button, Input, List, Space, Switch, Tag, Typography } from 'antd';
import type { NetworkEntry } from '../../types';

type Props = {
  entries: NetworkEntry[];
  onClear: () => void;
};

function shellEscape(s: string): string {
  return s.replace(/"/g, '\\"').replace(/'/g, `'"'"'`);
}

function entryToCurl(entry: NetworkEntry): string {
  let cmd = `curl -X ${shellEscape(entry.method)} '${shellEscape(entry.url)}'`;
  for (const [k, v] of Object.entries(entry.headers ?? {})) {
    cmd += ` -H '${shellEscape(k)}: ${shellEscape(String(v))}'`;
  }
  if (entry.postData) {
    cmd += ` --data '${shellEscape(entry.postData)}'`;
  }
  return cmd;
}

export function NetworkLogSection({ entries, onClear }: Props) {
  const [keyword, setKeyword] = React.useState('');
  const [methodFilter, setMethodFilter] = React.useState('ALL');
  const [onlyXhrFetch, setOnlyXhrFetch] = React.useState(true);

  const methods = React.useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) set.add(e.method.toUpperCase());
    return ['ALL', ...Array.from(set).sort()];
  }, [entries]);

  const filtered = React.useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return entries
      .slice()
      .reverse()
      .filter((e) => (methodFilter === 'ALL' ? true : e.method.toUpperCase() === methodFilter))
      .filter((e) => (onlyXhrFetch ? ['XHR', 'FETCH'].includes((e.resourceType ?? '').toUpperCase()) : true))
      .filter((e) => (kw ? e.url.toLowerCase().includes(kw) : true));
  }, [entries, keyword, methodFilter, onlyXhrFetch]);

  const copyOne = async (entry: NetworkEntry) => {
    const cmd = entryToCurl(entry);
    await navigator.clipboard.writeText(cmd);
  };

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Text strong>Network 日志中心</Typography.Text>
        <Button size="small" danger onClick={onClear}>清空记录</Button>
      </Space>
      <Space>
        <Typography.Text type="secondary">仅 XHR/Fetch</Typography.Text>
        <Switch size="small" checked={onlyXhrFetch} onChange={setOnlyXhrFetch} />
      </Space>
      <Space wrap>
        {methods.map((m) => (
          <Tag
            key={m}
            color={methodFilter === m ? 'blue' : 'default'}
            style={{ cursor: 'pointer' }}
            onClick={() => setMethodFilter(m)}
          >
            {m}
          </Tag>
        ))}
      </Space>
      <Input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="按 URL 关键字筛选"
      />
      <List
        size="small"
        bordered
        locale={{ emptyText: '暂无记录' }}
        style={{ maxHeight: 220, overflow: 'auto', background: '#fff' }}
        dataSource={filtered}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Button key="copy" size="small" onClick={() => void copyOne(item)}>
                复制 cURL
              </Button>
            ]}
          >
            <Space direction="vertical" size={1} style={{ maxWidth: 300 }}>
              <Space size={6}>
                <Typography.Text strong>{item.method}</Typography.Text>
                <Tag>{item.resourceType ?? 'UNKNOWN'}</Tag>
              </Space>
              <Typography.Text ellipsis={{ tooltip: item.url }} style={{ maxWidth: 280 }}>
                {item.url}
              </Typography.Text>
              <Typography.Text type="secondary">
                {new Date(item.ts).toLocaleTimeString()}
              </Typography.Text>
            </Space>
          </List.Item>
        )}
      />
    </Space>
  );
}
