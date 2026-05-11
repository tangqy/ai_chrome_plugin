import React from 'react';
import { Button, Divider, Input, Space, Typography } from 'antd';

type Props = {
  runtimeConnected: boolean;
};

export function TextToolsSection({ runtimeConnected }: Props) {
  const [unicodeInput, setUnicodeInput] = React.useState('\\u4f60\\u597d');
  const [unicodeOutput, setUnicodeOutput] = React.useState('');
  const [jsonInput, setJsonInput] = React.useState('{"a":1,"b":[2,3]}');
  const [jsonOutput, setJsonOutput] = React.useState('');

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

  return (
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
  );
}
