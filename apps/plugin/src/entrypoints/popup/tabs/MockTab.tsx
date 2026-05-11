import React from 'react';
import { Button, Input, InputNumber, List, Select, Space, Switch, Typography } from 'antd';
import type { MockRule } from '../types';

type RulePayload = Omit<MockRule, 'id'> & { id?: string };

type Draft = {
  name: string;
  method: string;
  pathPattern: string;
  headers: Record<string, string>;
  postData?: string;
};

type Props = {
  rules: MockRule[];
  seedDraft?: Draft | null;
  onConsumeSeedDraft: () => void;
  onImportCurl: (curl: string) => Promise<Draft | null>;
  onPreviewRule: (payload: Record<string, unknown>) => Promise<string>;
  onUpsertRule: (payload: RulePayload) => void;
  onDeleteRule: (id: string) => void;
  onToggleRule: (id: string, enabled: boolean) => void;
};

export function MockTab(props: Props) {
  const {
    rules,
    seedDraft,
    onConsumeSeedDraft,
    onImportCurl,
    onPreviewRule,
    onUpsertRule,
    onDeleteRule,
    onToggleRule
  } = props;

  const [name, setName] = React.useState('demo-mock');
  const [scene, setScene] = React.useState('default');
  const [priority, setPriority] = React.useState(100);
  const [pathPattern, setPathPattern] = React.useState('/api/test');
  const [method, setMethod] = React.useState('GET');
  const [status, setStatus] = React.useState(200);
  const [delayMs, setDelayMs] = React.useState(0);
  const [referer, setReferer] = React.useState('');
  const [headerMatchText, setHeaderMatchText] = React.useState('{}');
  const [requestHeaderPatchText, setRequestHeaderPatchText] = React.useState('{}');
  const [responseHeadersText, setResponseHeadersText] = React.useState('{"content-type":"application/json; charset=utf-8"}');
  const [responseBodyMode, setResponseBodyMode] = React.useState<'fixed' | 'mockjs' | 'script'>('fixed');
  const [responseBodyRaw, setResponseBodyRaw] = React.useState('{"code":0,"data":{}}');
  const [mockjsTemplate, setMockjsTemplate] = React.useState('{"code":0,"list|2-5":[{"id|+1":1,"name":"@cname"}]}');
  const [importsText, setImportsText] = React.useState('');
  const [script, setScript] = React.useState("return { code: 0, data: { now: context.now } };");
  const [curlText, setCurlText] = React.useState('');
  const [previewText, setPreviewText] = React.useState('');

  React.useEffect(() => {
    if (!seedDraft) return;
    setName(seedDraft.name);
    setMethod(seedDraft.method);
    setPathPattern(seedDraft.pathPattern);
    setHeaderMatchText(JSON.stringify(seedDraft.headers ?? {}, null, 2));
    onConsumeSeedDraft();
  }, [seedDraft, onConsumeSeedDraft]);

  const handleImportCurl = async () => {
    const draft = await onImportCurl(curlText);
    if (!draft) return;
    setName(draft.name);
    setMethod(draft.method);
    setPathPattern(draft.pathPattern);
    setHeaderMatchText(JSON.stringify(draft.headers ?? {}, null, 2));
  };

  const preview = async () => {
    const out = await onPreviewRule({ responseBodyMode, responseBodyRaw, mockjsTemplate, script });
    setPreviewText(out);
  };

  const save = () => {
    const imports = importsText.split('\n').map((x) => x.trim()).filter(Boolean);
    const patchBase = JSON.parse(requestHeaderPatchText || '{}') as Record<string, string>;
    const requestHeaderPatch = referer ? { ...patchBase, referer } : patchBase;

    onUpsertRule({
      name,
      enabled: true,
      priority,
      scene,
      requestMatch: {
        method,
        pathPattern,
        headerMatch: JSON.parse(headerMatchText || '{}') as Record<string, string>
      },
      requestHeaderPatch,
      responseBodyMode,
      responseBodyRaw,
      mockjsTemplate,
      responseHeaders: JSON.parse(responseHeadersText || '{}') as Record<string, string>,
      status,
      delayMs,
      script,
      imports
    });
  };

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Typography.Text strong>快速建规则（cURL / 日志导入）</Typography.Text>
      <Input.TextArea value={curlText} onChange={(e) => setCurlText(e.target.value)} placeholder="粘贴 cURL" autoSize={{ minRows: 2, maxRows: 4 }} />
      <Button onClick={() => void handleImportCurl()} block>解析 cURL 并带入草稿</Button>

      <Typography.Text strong>规则基础</Typography.Text>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="规则名" />
      <Space>
        <Input value={scene} onChange={(e) => setScene(e.target.value)} placeholder="scene" />
        <InputNumber value={priority} min={1} onChange={(v) => setPriority(Number(v ?? 100))} placeholder="priority" />
      </Space>
      <Input value={pathPattern} onChange={(e) => setPathPattern(e.target.value)} placeholder="path pattern，如 /api/user" />
      <Select value={method} onChange={setMethod} options={[{ label: 'ALL', value: 'ALL' }, { label: 'GET', value: 'GET' }, { label: 'POST', value: 'POST' }, { label: 'PUT', value: 'PUT' }, { label: 'DELETE', value: 'DELETE' }, { label: 'PATCH', value: 'PATCH' }]} />

      <Typography.Text strong>请求匹配与覆盖</Typography.Text>
      <Input value={referer} onChange={(e) => setReferer(e.target.value)} placeholder="Referer（快捷）" />
      <Input.TextArea value={headerMatchText} onChange={(e) => setHeaderMatchText(e.target.value)} placeholder="headerMatch JSON" autoSize={{ minRows: 2, maxRows: 4 }} />
      <Input.TextArea value={requestHeaderPatchText} onChange={(e) => setRequestHeaderPatchText(e.target.value)} placeholder="requestHeaderPatch JSON" autoSize={{ minRows: 2, maxRows: 4 }} />

      <Typography.Text strong>响应设置</Typography.Text>
      <Space>
        <InputNumber value={status} min={100} max={599} onChange={(v) => setStatus(Number(v ?? 200))} placeholder="HTTP 状态码" />
        <InputNumber value={delayMs} min={0} onChange={(v) => setDelayMs(Number(v ?? 0))} placeholder="延迟 ms" />
      </Space>
      <Input.TextArea value={responseHeadersText} onChange={(e) => setResponseHeadersText(e.target.value)} placeholder="responseHeaders JSON" autoSize={{ minRows: 2, maxRows: 4 }} />
      <Select value={responseBodyMode} onChange={(v) => setResponseBodyMode(v)} options={[{ label: 'fixed', value: 'fixed' }, { label: 'mockjs', value: 'mockjs' }, { label: 'script', value: 'script' }]} />

      {responseBodyMode === 'fixed' ? <Input.TextArea value={responseBodyRaw} onChange={(e) => setResponseBodyRaw(e.target.value)} placeholder="复制真实响应体并修改字段（JSON/文本）" autoSize={{ minRows: 4, maxRows: 8 }} /> : null}
      {responseBodyMode === 'mockjs' ? <Input.TextArea value={mockjsTemplate} onChange={(e) => setMockjsTemplate(e.target.value)} placeholder="MockJS 模板" autoSize={{ minRows: 4, maxRows: 8 }} /> : null}
      {responseBodyMode === 'script' ? <><Input.TextArea value={importsText} onChange={(e) => setImportsText(e.target.value)} placeholder="每行：别名@https://esm.sh/xxx" autoSize={{ minRows: 2, maxRows: 4 }} /><Input.TextArea value={script} onChange={(e) => setScript(e.target.value)} placeholder="return {...};" autoSize={{ minRows: 4, maxRows: 8 }} /></> : null}

      <Space>
        <Button onClick={() => void preview()}>预览响应</Button>
        <Button type="primary" onClick={save}>保存规则</Button>
      </Space>
      <Input.TextArea value={previewText} readOnly autoSize={{ minRows: 3, maxRows: 6 }} placeholder="预览输出" />

      <List
        size="small"
        bordered
        dataSource={rules}
        locale={{ emptyText: '暂无规则' }}
        renderItem={(item) => (
          <List.Item actions={[<Switch key="sw" size="small" checked={item.enabled} onChange={(v) => onToggleRule(item.id, v)} />, <a key="del" onClick={() => onDeleteRule(item.id)}>删除</a>]}>
            <Space direction="vertical" size={1}>
              <Typography.Text strong>{item.name}</Typography.Text>
              <Typography.Text type="secondary">{item.requestMatch.method} | {item.requestMatch.pathPattern}</Typography.Text>
              <Typography.Text type="secondary">scene={item.scene} priority={item.priority} mode={item.responseBodyMode}</Typography.Text>
            </Space>
          </List.Item>
        )}
      />
    </Space>
  );
}
