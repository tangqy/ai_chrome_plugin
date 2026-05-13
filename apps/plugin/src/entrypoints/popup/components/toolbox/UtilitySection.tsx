import React from 'react';
import { Button, Divider, Input, Select, Space, Typography } from 'antd';
import QRCode from 'qrcode';
import type { NetworkEntry } from '../../types';
import { NetworkLogSection } from './NetworkLogSection';

type Props = {
  proxyMode: 'system' | 'direct';
  networkRecordingEnabled: boolean;
  networkEntryCount: number;
  networkEntries: NetworkEntry[];
  curlOutput: string;
  onSetProxy: (mode: 'system' | 'direct') => void;
  onSetNetworkRecording: (enabled: boolean) => void;
  networkRecordingFilter: { pathKeyword: string; pathMatchMode: 'contains' | 'regex'; filterMode: 'all' | 'allow' | 'deny'; methods: string[]; resourceTypes: string[]; bodyPreviewLimit: '256kb' | '1mb' | '5mb' };
  onSetNetworkRecordingFilter: (filter: { pathKeyword: string; pathMatchMode: 'contains' | 'regex'; filterMode: 'all' | 'allow' | 'deny'; methods: string[]; resourceTypes: string[]; bodyPreviewLimit: '256kb' | '1mb' | '5mb' }) => void;
  onClearNetworkRecording: () => void;
  onExportNetworkCurl: () => void;
  onCreateMockFromEntry: (entry: NetworkEntry) => void;
};

export function UtilitySection(props: Props) {
  const {
    proxyMode,
    networkRecordingEnabled,
    networkEntryCount,
    networkEntries,
    networkRecordingFilter,
    curlOutput,
    onSetProxy,
    onSetNetworkRecording,
    onSetNetworkRecordingFilter,
    onClearNetworkRecording,
    onExportNetworkCurl,
    onCreateMockFromEntry
  } = props;

  const [qrUrl, setQrUrl] = React.useState('https://example.com');
  const [qrDataUrl, setQrDataUrl] = React.useState('');
  const [tsInput, setTsInput] = React.useState(String(Date.now()));
  const [timeOutput, setTimeOutput] = React.useState('');

  React.useEffect(() => {
    void QRCode.toDataURL(qrUrl, { width: 180, margin: 1 })
      .then((url: string) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [qrUrl]);

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
      <Typography.Text type="secondary">录制过滤：路径关键字 / 请求方法 / 资源类型（不命中则不录制）</Typography.Text>
      <Space>
        <Select
          value={networkRecordingFilter.filterMode}
          style={{ width: 160 }}
          onChange={(v) => onSetNetworkRecordingFilter({ ...networkRecordingFilter, filterMode: v })}
          options={[
            { label: '所有(不过滤)', value: 'all' },
            { label: '白名单(仅命中)', value: 'allow' },
            { label: '黑名单(排除命中)', value: 'deny' }
          ]}
        />
        <Select
          value={networkRecordingFilter.pathMatchMode}
          style={{ width: 160 }}
          onChange={(v) => onSetNetworkRecordingFilter({ ...networkRecordingFilter, pathMatchMode: v })}
          options={[
            { label: '路径包含', value: 'contains' },
            { label: '正则匹配', value: 'regex' }
          ]}
        />
      </Space>
      <Input
        value={networkRecordingFilter.pathKeyword}
        onChange={(e) => onSetNetworkRecordingFilter({ ...networkRecordingFilter, pathKeyword: e.target.value })}
        placeholder="路径关键字或正则（如 /api/user 或 /api/(user|auth)）"
      />
      <Select
        mode="multiple"
        allowClear
        placeholder="请求方法过滤（为空=全部）"
        value={networkRecordingFilter.methods}
        style={{ width: '100%' }}
        onChange={(v) => onSetNetworkRecordingFilter({ ...networkRecordingFilter, methods: v })}
        options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].map((v) => ({ label: v, value: v }))}
      />
      <Select
        mode="multiple"
        allowClear
        placeholder="资源类型过滤（为空=全部）"
        value={networkRecordingFilter.resourceTypes}
        style={{ width: '100%' }}
        onChange={(v) => onSetNetworkRecordingFilter({ ...networkRecordingFilter, resourceTypes: v })}
        options={['XHR', 'FETCH', 'DOCUMENT', 'SCRIPT', 'STYLESHEET', 'IMAGE', 'MEDIA', 'FONT', 'OTHER'].map((v) => ({ label: v, value: v }))}
      />
      <Select
        value={networkRecordingFilter.bodyPreviewLimit}
        style={{ width: '100%' }}
        onChange={(v) => onSetNetworkRecordingFilter({ ...networkRecordingFilter, bodyPreviewLimit: v })}
        options={[
          { label: '体预览阈值：256KB', value: '256kb' },
          { label: '体预览阈值：1MB', value: '1mb' },
          { label: '体预览阈值：5MB', value: '5mb' }
        ]}
      />
      <Space>
        <Button type={networkRecordingEnabled ? 'default' : 'primary'} onClick={() => onSetNetworkRecording(true)}>开启录制</Button>
        <Button danger={networkRecordingEnabled} onClick={() => onSetNetworkRecording(false)}>关闭录制</Button>
      </Space>
      <Typography.Text type="secondary">状态：{networkRecordingEnabled ? '录制中' : '已关闭'}，记录条数：{networkEntryCount}</Typography.Text>
      <Button onClick={onExportNetworkCurl} block>导出全部为 cURL</Button>
      <Input.TextArea value={curlOutput} readOnly autoSize={{ minRows: 4, maxRows: 10 }} placeholder="导出的 cURL 命令会显示在这里" />
      <Divider style={{ margin: '8px 0' }} />
      <NetworkLogSection entries={networkEntries} onClear={onClearNetworkRecording} onCreateMockFromEntry={onCreateMockFromEntry} />
    </Space>
  );
}
