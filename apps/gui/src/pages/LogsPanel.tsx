import { useState, useEffect } from 'react';
import { Card, Typography, Table, Tag, Space, Button, Select, Input, Empty, Spin } from 'antd';
import { ReloadOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';

const { Title, Text } = Typography;

interface AppLog {
  id: number;
  trace_id: string;
  level: string;
  message: string;
  timestamp: string;
  source: string;
}

export default function LogsPanel() {
  const [logs, setLogs] = useState<AppLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [traceIdFilter, setTraceIdFilter] = useState<string>('');
  const [currentTraceId, setCurrentTraceId] = useState<string>('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const logsData = await invoke<AppLog[]>('get_logs', { limit: 100 });
      setLogs(logsData);
      
      const traceId = await invoke<string>('get_current_trace');
      setCurrentTraceId(traceId);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCleanupLogs = async () => {
    try {
      await invoke('cleanup_logs', { days: 7 });
      await fetchLogs();
    } catch (error) {
      console.error('Failed to cleanup logs:', error);
    }
  };

  const filteredLogs = logs.filter(log => {
    if (levelFilter !== 'all' && log.level !== levelFilter) {
      return false;
    }
    if (traceIdFilter && !log.trace_id.includes(traceIdFilter)) {
      return false;
    }
    return true;
  });

  const columns = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (timestamp: string) => new Date(timestamp).toLocaleString('zh-CN'),
    },
    {
      title: 'Trace ID',
      dataIndex: 'trace_id',
      key: 'trace_id',
      width: 280,
      render: (traceId: string) => (
        <Tag color="blue" style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {traceId.slice(0, 16)}...
        </Tag>
      ),
    },
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      width: 80,
      render: (level: string) => {
        const color = level === 'error' ? 'red' : level === 'warn' ? 'orange' : 'green';
        return <Tag color={color}>{level.toUpperCase()}</Tag>;
      },
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 100,
    },
    {
      title: '消息',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true,
    },
  ];

  return (
    <div>
      <Title level={2}>日志查看</Title>
      
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <Text strong>当前 Trace ID: </Text>
            <Tag color="purple">{currentTraceId || 'N/A'}</Tag>
          </div>
          
          <Space>
            <Select
              value={levelFilter}
              onChange={setLevelFilter}
              style={{ width: 120 }}
            >
              <Select.Option value="all">全部级别</Select.Option>
              <Select.Option value="info">INFO</Select.Option>
              <Select.Option value="warn">WARN</Select.Option>
              <Select.Option value="error">ERROR</Select.Option>
            </Select>
            
            <Input
              placeholder="过滤 Trace ID"
              value={traceIdFilter}
              onChange={(e) => setTraceIdFilter(e.target.value)}
              style={{ width: 200 }}
              prefix={<SearchOutlined />}
              allowClear
            />
            
            <Button icon={<ReloadOutlined />} onClick={fetchLogs} loading={loading}>
              刷新
            </Button>
            
            <Button icon={<DeleteOutlined />} onClick={handleCleanupLogs} danger>
              清理日志
            </Button>
          </Space>
        </Space>
      </Card>
      
      <Card>
        {loading && logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <Empty description="暂无日志" />
        ) : (
          <Table
            dataSource={filteredLogs}
            columns={columns}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 20, showSizeChanger: true }}
            scroll={{ x: 'max-content', y: 500 }}
          />
        )}
      </Card>
    </div>
  );
}
