import React from 'react';
import { Button, Collapse, Divider, Input, List, Select, Space, Typography } from 'antd';
import QRCode from 'qrcode';
import type { AutomationTask } from '../types';

type Props = {
  runtimeConnected: boolean;
  proxyMode: 'system' | 'direct';
  networkRecordingEnabled: boolean;
  networkEntryCount: number;
  automationTasks: AutomationTask[];
  onSetProxy: (mode: 'system' | 'direct') => void;
  onSetNetworkRecording: (enabled: boolean) => void;
  onExportNetworkCurl: () => void;
  curlOutput: string;
  onUpsertTask: (name: string, cron: string, script: string) => void;
  onDeleteTask: (id: string) => void;
};

export function ToolboxTab(props: Props) {
  const {
    runtimeConnected,
    proxyMode,
    networkRecordingEnabled,
    networkEntryCount,
    automationTasks,
    onSetProxy,
    onSetNetworkRecording,
    onExportNetworkCurl,
    curlOutput,
    onUpsertTask,
    onDeleteTask
  } = props;

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

  const diffLines = React.useMemo(() => diffOutput.split('\n'), [diffOutput]);

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
      if (!runtimeConnected) return;
      const res = await chrome.runtime.sendMessage({ type: 'FORMAT_JSON_FAST', payload: { input: jsonInput } });
      if (res?.ok && res.payload?.ok) setJsonOutput(String(res.payload.output ?? ''));
    } catch (err) {
      setJsonOutput(`JSON 格式错误: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }, [jsonInput, runtimeConnected]);

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
    if (!runtimeConnected) return;
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

  return (
    <Collapse
      size="small"
      items={[
        {
          key: 'text-tools',
          label: '文本工具（Unicode / JSON）',
          children: (
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <Typography.Text strong>Unicode 转中文</Typography.Text>
              <Input.TextArea value={unicodeInput} onChange={(e) => setUnicodeInput(e.target.value)} autoSize={{ minRows: 2, maxRows: 4 }} />
              <Button onClick={decodeUnicode} block>转换</Button>
              <Input.TextArea value={unicodeOutput} readOnly autoSize={{ minRows: 2, maxRows: 4 }} />
              <Divider style={{ margin: '8px 0' }} />
              <Typography.Text strong>JSON 格式化（离线优先，桥接增强）</Typography.Text>
              <Input.TextArea value={jsonInput} onChange={(e) => setJsonInput(e.target.value)} autoSize={{ minRows: 4, maxRows: 8 }} />
              <Input.TextArea value={jsonOutput} readOnly autoSize={{ minRows: 4, maxRows: 10 }} />
            </Space>
          )
        },
        {
          key: 'diff-tool',
          label: 'Diff 对比（Git 风格）',
          children: (
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Input.TextArea value={diffLeft} onChange={(e) => setDiffLeft(e.target.value)} autoSize={{ minRows: 3, maxRows: 8 }} placeholder="左侧内容" />
              <Input.TextArea value={diffRight} onChange={(e) => setDiffRight(e.target.value)} autoSize={{ minRows: 3, maxRows: 8 }} placeholder="右侧内容" />
              <Button onClick={() => void diffFast()} block>执行 Diff</Button>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fafafa', maxHeight: 240, overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}>
                {diffLines.map((line, idx) => {
                  const isAdd = line.startsWith('+');
                  const isDel = line.startsWith('-');
                  return (
                    <div key={`${idx}-${line}`} style={{ padding: '2px 8px', whiteSpace: 'pre-wrap', background: isAdd ? '#ecfdf3' : isDel ? '#fef2f2' : 'transparent', color: isAdd ? '#166534' : isDel ? '#991b1b' : '#111827' }}>
                      {line || ' '}
                    </div>
                  );
                })}
              </div>
            </Space>
          )
        },
        {
          key: 'utility-tools',
          label: '实用工具（二维码 / 时间 / 代理 / Network）',
          children: (
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <Typography.Text strong>网站二维码（离线）</Typography.Text>
              <Input value={qrUrl} onChange={(e) => setQrUrl(e.target.value)} placeholder="https://..." />
              {qrDataUrl ? <img alt="qr" src={qrDataUrl} style={{ width: 180, height: 180, border: '1px solid #eee' }} /> : <Typography.Text type="secondary">二维码生成失败</Typography.Text>}
              <Divider style={{ margin: '8px 0' }} />
              <Typography.Text strong>时间工具</Typography.Text>
              <Button onClick={() => setTsInput(String(Date.now()))} block>获取当前时间戳</Button>
              <Input value={tsInput} onChange={(e) => setTsInput(e.target.value)} placeholder="输入时间戳（秒/毫秒）" />
              <Button onClick={convertTime} block>时间戳转换</Button>
              <Input.TextArea value={timeOutput} readOnly autoSize={{ minRows: 2, maxRows: 4 }} />
              <Divider style={{ margin: '8px 0' }} />
              <Typography.Text strong>代理切换</Typography.Text>
              <Typography.Text type="secondary">当前模式：{proxyMode === 'direct' ? '直连' : '系统代理'}</Typography.Text>
              <Select value={proxyMode} onChange={onSetProxy} options={[{ label: '系统代理', value: 'system' }, { label: '直连', value: 'direct' }]} />
              <Divider style={{ margin: '8px 0' }} />
              <Typography.Text strong>Network 录制（当前 Tab）</Typography.Text>
              <Space>
                <Button type={networkRecordingEnabled ? 'default' : 'primary'} onClick={() => onSetNetworkRecording(true)}>开启录制</Button>
                <Button danger={networkRecordingEnabled} onClick={() => onSetNetworkRecording(false)}>关闭录制</Button>
              </Space>
              <Typography.Text type="secondary">状态：{networkRecordingEnabled ? '录制中' : '已关闭'}，记录条数：{networkEntryCount}</Typography.Text>
              <Button onClick={onExportNetworkCurl} block>导出为 cURL</Button>
              <Input.TextArea value={curlOutput} readOnly autoSize={{ minRows: 4, maxRows: 10 }} placeholder="导出的 cURL 命令会显示在这里" />
            </Space>
          )
        },
        {
          key: 'automation-tools',
          label: '自动化任务（Cron + JS）',
          children: (
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Input value={taskName} onChange={(e) => setTaskName(e.target.value)} placeholder="任务名" />
              <Input value={taskCron} onChange={(e) => setTaskCron(e.target.value)} placeholder="cron: */5 * * * *" />
              <Input.TextArea value={taskScript} onChange={(e) => setTaskScript(e.target.value)} autoSize={{ minRows: 2, maxRows: 5 }} placeholder="return 'ok';" />
              <Button onClick={() => onUpsertTask(taskName, taskCron, taskScript)} block>保存任务</Button>
              <List
                size="small"
                dataSource={automationTasks}
                locale={{ emptyText: '暂无任务' }}
                renderItem={(task) => (
                  <List.Item actions={[<a key="del" onClick={() => onDeleteTask(task.id)}>删除</a>]}> 
                    <Space direction="vertical" size={1}>
                      <Typography.Text strong>{task.name}</Typography.Text>
                      <Typography.Text type="secondary">{task.cron} | {task.lastRunAt ? new Date(task.lastRunAt).toLocaleTimeString() : '-'}</Typography.Text>
                      <Typography.Text type="secondary">{task.lastResult ?? '-'}</Typography.Text>
                    </Space>
                  </List.Item>
                )}
              />
            </Space>
          )
        }
      ]}
    />
  );
}
