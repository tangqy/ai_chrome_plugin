import { Card, Typography, Space, Button, Tag, Descriptions, Spin } from 'antd';
import { PoweroffOutlined, ReloadOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

const { Title } = Typography;

interface BridgeStatus {
  running: boolean;
  pid: number | null;
  uptime_secs: number | null;
}

export default function ServicePanel() {
  const [status, setStatus] = useState<BridgeStatus>({ running: false, pid: null, uptime_secs: null });
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      const s = await invoke<BridgeStatus>('get_bridge_status');
      setStatus(s);
    } catch (e) {
      console.error('Failed to get status:', e);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    setLoading(true);
    try {
      await invoke('start_bridge');
      await fetchStatus();
    } catch (e) {
      console.error('Failed to start:', e);
    }
    setLoading(false);
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await invoke('stop_bridge');
      await fetchStatus();
    } catch (e) {
      console.error('Failed to stop:', e);
    }
    setLoading(false);
  };

  const formatUptime = (secs: number | null) => {
    if (secs === null) return '-';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h}h ${m}m ${s}s`;
  };

  return (
    <Card title="服务控制" style={{ maxWidth: 600, margin: '0 auto' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ textAlign: 'center' }}>
          <Tag color={status.running ? 'green' : 'red'} style={{ fontSize: 16, padding: '4px 12px' }}>
            {status.running ? 'Running' : 'Stopped'}
          </Tag>
        </div>

        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="PID">{status.pid ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="运行时长">{formatUptime(status.uptime_secs)}</Descriptions.Item>
        </Descriptions>

        <Space style={{ display: 'flex', justifyContent: 'center' }}>
          <Button
            type="primary"
            icon={<PoweroffOutlined />}
            onClick={handleStart}
            loading={loading}
            disabled={status.running}
          >
            启动服务
          </Button>
          <Button
            danger
            icon={<PoweroffOutlined />}
            onClick={handleStop}
            loading={loading}
            disabled={!status.running}
          >
            停止服务
          </Button>
          <Button icon={<ReloadOutlined />} onClick={fetchStatus}>
            刷新
          </Button>
        </Space>
      </Space>
    </Card>
  );
}
