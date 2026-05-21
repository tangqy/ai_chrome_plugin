import React from 'react';
import { createRoot } from 'react-dom/client';
import { Alert, Button, Card, Input, List, Space, Typography } from 'antd';
import 'antd/dist/reset.css';

import { RuntimeMessageTypes, type HumanFeedback, type HumanVerifyTask } from '../shared/validation';

function App() {
  const [task, setTask] = React.useState<HumanVerifyTask | null>(null);
  const [comment, setComment] = React.useState('');

  React.useEffect(() => {
    const handler = (message: unknown) => {
      const m = message as { type?: string; payload?: unknown };
      if (m?.type === RuntimeMessageTypes.humanVerifyPromptPush) {
        setTask((m.payload as HumanVerifyTask | null) ?? null);
      }
    };

    chrome.runtime.onMessage.addListener(handler);
    void chrome.runtime.sendMessage({ type: RuntimeMessageTypes.humanVerifyPromptGet }).then((res) => {
      if (res?.ok) setTask((res.payload?.task as HumanVerifyTask | null) ?? null);
    });

    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const submit = async (stepId: string, result: HumanFeedback['result']) => {
    if (!task) return;
    await chrome.runtime.sendMessage({
      type: RuntimeMessageTypes.humanVerifyFeedbackSubmit,
      payload: {
        taskId: task.taskId,
        traceId: task.traceId,
        stepId,
        result,
        comment: comment.trim() ? comment.trim() : undefined,
        ts: Date.now(),
      } satisfies HumanFeedback,
    });
  };

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
                  <Space direction="vertical" size={6} style={{ width: '100%' }}>
                    <Space direction="vertical" size={2}>
                      <Typography.Text strong>
                        {idx + 1}. {step.instruction}
                      </Typography.Text>
                      {step.expected ? <Typography.Text type="secondary">预期：{step.expected}</Typography.Text> : null}
                      <Typography.Text type="secondary">
                        stepId: {step.stepId} · {step.type}
                      </Typography.Text>
                    </Space>
                    <Space>
                      <Button size="small" type="primary" onClick={() => void submit(step.stepId, 'passed')}>
                        通过
                      </Button>
                      <Button size="small" danger onClick={() => void submit(step.stepId, 'failed')}>
                        失败
                      </Button>
                    </Space>
                  </Space>
                </List.Item>
              )}
            />
            <Input.TextArea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="备注（可选）：例如点击无反应、结果不对、报错信息等"
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </Space>
        )}
      </Card>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
