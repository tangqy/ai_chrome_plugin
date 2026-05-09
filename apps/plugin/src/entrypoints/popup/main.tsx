import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Card, Space, Tag, Typography } from 'antd';
import { ApiOutlined } from '@ant-design/icons';
import 'antd/dist/reset.css';

function App() {
  const [status, setStatus] = React.useState('idle');

  const ping = async () => {
    setStatus('pinging...');
    try {
      const res = await chrome.runtime.sendMessage({ type: 'PING' });
      setStatus(res?.ok ? `ok @ ${new Date(res.ts).toLocaleTimeString()}` : 'failed');
    } catch {
      setStatus('error');
    }
  };

  return (
    <main style={{ padding: 12, width: 360, background: '#f5f7fa' }}>
      <Card size="small" title="Wujie AI Sensing">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">Runtime bridge health check</Typography.Text>
          <Tag color={status.startsWith('ok') ? 'success' : 'default'}>{status}</Tag>
          <Button type="primary" icon={<ApiOutlined />} onClick={ping} block>
            Ping Background
          </Button>
        </Space>
      </Card>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
