import React from 'react';
import { createRoot } from 'react-dom/client';
import { Alert, Card, List, Space, Typography } from 'antd';
import 'antd/dist/reset.css';

type Step = {
  stepId: string;
  type: 'navigate' | 'click' | 'input' | 'observe' | 'mock_trigger';
  instruction: string;
  expected?: string;
};

type HumanTask = {
  taskId: string;
  traceId: string;
  title: string;
  steps: Step[];
};

function App() {
  const [task, setTask] = React.useState<HumanTask | null>(null);

  React.useEffect(() => {
    const handler = (message: unknown) => {
      const m = message as { type?: string; payload?: unknown };
      if (m?.type === 'HUMAN_VERIFY_PROMPT_PUSH') {
        setTask((m.payload as HumanTask | null) ?? null);
      }
    };

    chrome.runtime.onMessage.addListener(handler);
    void chrome.runtime.sendMessage({ type: 'HUMAN_VERIFY_PROMPT_GET' }).then((res) => {
      if (res?.ok) setTask((res.payload?.task as HumanTask | null) ?? null);
    });

    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  return (
    <main style={{ padding: 12, height: '100vh', boxSizing: 'border-box', background: '#f5f7fa' }}>
      <Card size="small" title="人工验证">
        {!task ? (
          <Alert type="info" message="暂无待执行的验证任务" showIcon />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Alert
              type="warning"
              showIcon
              message="需要人工按步骤操作页面"
              description={
                <Space direction="vertical" size={4}>
                  <Typography.Text strong>{task.title}</Typography.Text>
                  <Typography.Text type="secondary">taskId: {task.taskId}</Typography.Text>
                  <Typography.Text type="secondary">traceId: {task.traceId}</Typography.Text>
                </Space>
              }
            />
            <List
              size="small"
              bordered
              dataSource={task.steps ?? []}
              renderItem={(step, idx) => (
                <List.Item>
                  <Space direction="vertical" size={2}>
                    <Typography.Text strong>
                      {idx + 1}. {step.instruction}
                    </Typography.Text>
                    {step.expected ? <Typography.Text type="secondary">预期：{step.expected}</Typography.Text> : null}
                    <Typography.Text type="secondary">
                      stepId: {step.stepId} · {step.type}
                    </Typography.Text>
                  </Space>
                </List.Item>
              )}
            />
          </Space>
        )}
      </Card>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

