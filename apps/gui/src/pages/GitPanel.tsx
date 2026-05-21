import { useState, useEffect } from 'react';
import {
  Card,
  Typography,
  Button,
  Select,
  Input,
  List,
  Tag,
  Space,
  Modal,
  Descriptions,
  message,
  Spin,
  Empty,
} from 'antd';
import {
  FolderOpenOutlined,
  SwapOutlined,
  SearchOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { open } from '@tauri-apps/plugin-dialog';
import { useGit } from '../hooks/useGit';
import { GitProvider } from '../contexts/GitContext';
import { CommitInfo, CommitDetail } from '../types';

const { Title, Text } = Typography;
const { Search } = Input;

function GitPanelContent() {
  const {
    repository,
    branches,
    currentBranch,
    commits,
    loading,
    error,
    openRepository,
    switchBranch,
    getCommits,
    searchCommits,
    getCommitDetail,
  } = useGit();

  const [selectedCommit, setSelectedCommit] = useState<CommitDetail | null>(null);
  const [commitDetailVisible, setCommitDetailVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const perPage = 20;

  const handleSelectRepository = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择 Git 仓库',
      });

      if (selected) {
        await openRepository(selected as string);
        setCurrentPage(0);
        message.success('仓库已打开');
      }
    } catch (err) {
      console.error('Failed to select repository:', err);
      message.error('选择仓库失败');
    }
  };

  const handleBranchChange = async (branchName: string) => {
    try {
      await switchBranch(branchName);
      setCurrentPage(0);
      message.success(`已切换到分支: ${branchName}`);
    } catch (err) {
      console.error('Failed to switch branch:', err);
      message.error('切换分支失败');
    }
  };

  const handleSearch = async (value: string) => {
    setSearchQuery(value);
    if (value.trim()) {
      await searchCommits(value);
    } else {
      await getCommits(0, perPage);
    }
  };

  const handleLoadMore = async () => {
    const nextPage = currentPage + 1;
    await getCommits(nextPage, perPage);
    setCurrentPage(nextPage);
  };

  const handleShowCommitDetail = async (commit: CommitInfo) => {
    const detail = await getCommitDetail(commit.hash);
    if (detail) {
      setSelectedCommit(detail);
      setCommitDetailVisible(true);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  useEffect(() => {
    if (error) {
      message.error(error);
    }
  }, [error]);

  return (
    <div>
      <Title level={2}>Git 管理</Title>

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card title="仓库选择" size="small">
          <Space>
            <Button
              icon={<FolderOpenOutlined />}
              onClick={handleSelectRepository}
              loading={loading}
            >
              选择仓库
            </Button>
            {repository && (
              <Text>
                当前仓库: <Text strong>{repository.name}</Text>
              </Text>
            )}
          </Space>
        </Card>

        {repository && (
          <>
            <Card title="分支管理" size="small">
              <Space>
                <Text>当前分支:</Text>
                <Tag color="blue">{currentBranch?.name || 'Unknown'}</Tag>
                <Select
                  placeholder="切换分支"
                  style={{ width: 200 }}
                  onChange={handleBranchChange}
                  value={currentBranch?.name}
                >
                  {branches.map((branch) => (
                    <Select.Option key={branch.name} value={branch.name}>
                      {branch.name} {branch.is_current && '(当前)'}
                    </Select.Option>
                  ))}
                </Select>
                <Button icon={<SwapOutlined />} onClick={() => handleBranchChange(currentBranch?.name || '')}>
                  刷新
                </Button>
              </Space>
            </Card>

            <Card title="提交历史" size="small">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Space>
                  <Search
                    placeholder="搜索提交记录"
                    allowClear
                    style={{ width: 300 }}
                    prefix={<SearchOutlined />}
                    onSearch={handleSearch}
                    onChange={(e) => !e.target.value && handleSearch('')}
                  />
                  <Button icon={<ReloadOutlined />} onClick={() => handleSearch('')}>
                    刷新
                  </Button>
                </Space>

                {loading && commits.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 20 }}>
                    <Spin />
                  </div>
                ) : commits.length === 0 ? (
                  <Empty description="暂无提交记录" />
                ) : (
                  <List
                    size="small"
                    dataSource={commits}
                    renderItem={(commit) => (
                      <List.Item
                        actions={[
                          <Button
                            key="detail"
                            type="link"
                            size="small"
                            onClick={() => handleShowCommitDetail(commit)}
                          >
                            详情
                          </Button>,
                        ]}
                      >
                        <List.Item.Meta
                          title={
                            <Space>
                              <Tag>{commit.short_hash}</Tag>
                              <Text ellipsis style={{ maxWidth: 400 }}>
                                {commit.message}
                              </Text>
                            </Space>
                          }
                          description={
                            <Space>
                              <Text type="secondary">{commit.author}</Text>
                              <Text type="secondary">•</Text>
                              <Text type="secondary">{formatTimestamp(commit.timestamp)}</Text>
                            </Space>
                          }
                        />
                      </List.Item>
                    )}
                  />
                )}

                {!searchQuery && commits.length > 0 && (
                  <div style={{ textAlign: 'center' }}>
                    <Button onClick={handleLoadMore} loading={loading}>
                      加载更多
                    </Button>
                  </div>
                )}
              </Space>
            </Card>
          </>
        )}

        {!repository && (
          <Card>
            <Empty description="请先选择一个 Git 仓库" />
          </Card>
        )}
      </Space>

      <Modal
        title="提交详情"
        open={commitDetailVisible}
        onCancel={() => setCommitDetailVisible(false)}
        footer={[
          <Button key="close" onClick={() => setCommitDetailVisible(false)}>
            关闭
          </Button>,
        ]}
        width={700}
      >
        {selectedCommit && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="完整 Hash">
              <Text copyable>{selectedCommit.full_hash}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="短 Hash">
              <Tag>{selectedCommit.short_hash}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="作者">
              {selectedCommit.author} &lt;{selectedCommit.email}&gt;
            </Descriptions.Item>
            <Descriptions.Item label="时间">
              {formatTimestamp(selectedCommit.timestamp)}
            </Descriptions.Item>
            <Descriptions.Item label="提交信息">
              <div style={{ whiteSpace: 'pre-wrap' }}>{selectedCommit.message}</div>
            </Descriptions.Item>
            <Descriptions.Item label="修改文件">
              <List
                size="small"
                dataSource={selectedCommit.files_changed}
                renderItem={(file) => <List.Item style={{ padding: '4px 0' }}>{file}</List.Item>}
              />
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}

export default function GitPanel() {
  return (
    <GitProvider>
      <GitPanelContent />
    </GitProvider>
  );
}
