import React from 'react';
import { Button, Input, Space, Typography, Upload } from 'antd';
import type { UploadProps } from 'antd';

type Props = {
  runtimeConnected: boolean;
};

async function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('read file failed'));
    reader.readAsText(file, 'utf-8');
  });
}

function diffLocal(left: string, right: string): string {
  const a = left.split('\n');
  const b = right.split('\n');
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
  return out.join('\n');
}

export function DiffSection({ runtimeConnected }: Props) {
  const [leftName, setLeftName] = React.useState('');
  const [rightName, setRightName] = React.useState('');
  const [diffLeft, setDiffLeft] = React.useState('line1\nline2\nline3');
  const [diffRight, setDiffRight] = React.useState('line1\nlineX\nline3');
  const [diffOutput, setDiffOutput] = React.useState('');

  const diffLines = React.useMemo(() => diffOutput.split('\n'), [diffOutput]);

  const onPickLeft: UploadProps['beforeUpload'] = async (file) => {
    try {
      const text = await readFileText(file as File);
      setLeftName(file.name);
      setDiffLeft(text);
    } catch {
      setDiffOutput('读取左侧文件失败');
    }
    return false;
  };

  const onPickRight: UploadProps['beforeUpload'] = async (file) => {
    try {
      const text = await readFileText(file as File);
      setRightName(file.name);
      setDiffRight(text);
    } catch {
      setDiffOutput('读取右侧文件失败');
    }
    return false;
  };

  const diffFast = async () => {
    setDiffOutput(diffLocal(diffLeft, diffRight));

    if (!runtimeConnected) return;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'DIFF_TEXT_FAST', payload: { left: diffLeft, right: diffRight } });
      if (res?.ok && res.payload?.ok) setDiffOutput(String(res.payload.output ?? ''));
    } catch {}
  };

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Space>
        <Upload beforeUpload={onPickLeft} maxCount={1} showUploadList={false} accept=".txt,.md,.json,.js,.ts,.tsx,.jsx,.css,.html,.xml,.yml,.yaml,.log,*/*">
          <Button>选择左文件</Button>
        </Upload>
        <Upload beforeUpload={onPickRight} maxCount={1} showUploadList={false} accept=".txt,.md,.json,.js,.ts,.tsx,.jsx,.css,.html,.xml,.yml,.yaml,.log,*/*">
          <Button>选择右文件</Button>
        </Upload>
      </Space>
      <Typography.Text type="secondary">{leftName || '左侧未选择文件'} vs {rightName || '右侧未选择文件'}</Typography.Text>
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
  );
}
