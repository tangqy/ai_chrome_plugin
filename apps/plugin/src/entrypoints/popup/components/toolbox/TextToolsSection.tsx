import React from 'react';
import { Button, Divider, Input, Space, Typography } from 'antd';

type Props = {
  runtimeConnected: boolean;
};

function formatHtmlLocal(input: string): string {
  const src = input.trim();
  if (!src) return '';
  const compact = src
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const tokens = compact
    .replace(/</g, '\n<')
    .replace(/>/g, '>\n')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

  const out: string[] = [];
  let indent = 0;
  for (const t of tokens) {
    const isClose = t.startsWith('</');
    const isOpen = /^<[^!/][^>]*[^/]?>$/.test(t);
    const isComment = /^<!--/.test(t);

    if (isClose) indent = Math.max(0, indent - 1);
    out.push(`${'  '.repeat(indent)}${t}`);
    if (isOpen && !isComment) indent += 1;
  }
  return out.join('\n');
}

export function TextToolsSection({ runtimeConnected }: Props) {
  const [unicodeInput, setUnicodeInput] = React.useState('\\u4f60\\u597d');
  const [unicodeOutput, setUnicodeOutput] = React.useState('');
  const [jsonInput, setJsonInput] = React.useState('{"a":1,"b":[2,3]}');
  const [jsonOutput, setJsonOutput] = React.useState('');
  const [htmlInput, setHtmlInput] = React.useState('<div><span>hello</span><p>world</p></div>');
  const [htmlOutput, setHtmlOutput] = React.useState('');

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
      if (res?.ok && res.payload?.ok) {
        setJsonOutput(String(res.payload.output ?? ''));
      }
    } catch (err) {
      setJsonOutput(`JSON 格式错误: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }, [jsonInput, runtimeConnected]);

  const formatHtml = () => {
    try {
      setHtmlOutput(formatHtmlLocal(htmlInput));
    } catch (err) {
      setHtmlOutput(`HTML 格式错误: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  };

  React.useEffect(() => {
    const t = setTimeout(() => void formatJsonFast(), 180);
    return () => clearTimeout(t);
  }, [formatJsonFast]);

  return (
    <Space direction="vertical" size={10} style={{ width: '100%' }}>
      <Typography.Text strong>Unicode 转中文</Typography.Text>
      <Input.TextArea value={unicodeInput} onChange={(e) => setUnicodeInput(e.target.value)} autoSize={{ minRows: 2, maxRows: 4 }} />
      <Button onClick={decodeUnicode} block>转换</Button>
      <Input.TextArea value={unicodeOutput} readOnly autoSize={{ minRows: 2, maxRows: 4 }} />

      <Divider style={{ margin: '8px 0' }} />
      <Typography.Text strong>JSON 格式化（Rust 服务优先，JS兜底）</Typography.Text>
      <Input.TextArea value={jsonInput} onChange={(e) => setJsonInput(e.target.value)} autoSize={{ minRows: 4, maxRows: 8 }} />
      <Input.TextArea value={jsonOutput} readOnly autoSize={{ minRows: 4, maxRows: 10 }} />

      <Divider style={{ margin: '8px 0' }} />
      <Typography.Text strong>HTML 格式化</Typography.Text>
      <Input.TextArea value={htmlInput} onChange={(e) => setHtmlInput(e.target.value)} autoSize={{ minRows: 4, maxRows: 8 }} placeholder="粘贴 HTML" />
      <Button onClick={formatHtml} block>格式化 HTML</Button>
      <Input.TextArea value={htmlOutput} readOnly autoSize={{ minRows: 4, maxRows: 10 }} />
    </Space>
  );
}
