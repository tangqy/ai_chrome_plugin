import React from 'react';
import { createRoot } from 'react-dom/client';
import { Alert, Button, Card, Divider, Input, List, Space, Typography } from 'antd';
import 'antd/dist/reset.css';

import { RuntimeMessageTypes, type HumanFeedback, type HumanVerifyTask } from '../shared/validation';

type StepStatus = 'pending' | 'passed' | 'failed' | 'blocked' | 'suspended';

type TaskPhase = 'in_progress' | 'completed' | 'suspended';

function App() {
  const [task, setTask] = React.useState<HumanVerifyTask | null>(null);
  const [stepStatuses, setStepStatuses] = React.useState<Map<string, StepStatus>>(new Map());
  const [comment, setComment] = React.useState('');
  const [phase, setPhase] = React.useState<TaskPhase>('in_progress');
  const [startTime] = React.useState(Date.now());

  React.useEffect(() => {
    const handler = (message: unknown) => {
      console.log('[sidepanel] received runtime message:', message);
      const m = message as { type?: string; payload?: unknown };
      if (m?.type === RuntimeMessageTypes.humanVerifyPromptPush) {
        setTask((m.payload as HumanVerifyTask | null) ?? null);
        setStepStatuses(new Map());
        setComment('');
        setPhase('in_progress');
      }
    };

    chrome.runtime.onMessage.addListener(handler);
    void chrome.runtime.sendMessage({ type: RuntimeMessageTypes.humanVerifyPromptGet }).then((res) => {
      if (res?.ok) {
        setTask((res.payload?.task as HumanVerifyTask | null) ?? null);
        setStepStatuses(new Map());
        setPhase('in_progress');
      }
    });

    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const submitStep = async (stepId: string, result: HumanFeedback['result']) => {
    if (!task) return;
    try {
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
      setStepStatuses((prev) => {
        const next = new Map(prev);
        next.set(stepId, result as StepStatus);
        return next;
      });
      setComment('');
    } catch (e) {
      console.error('Failed to submit feedback:', e);
    }
  };

  const submitSuspend = async () => {
    if (!task) return;
    try {
      const pendingSteps = task.steps.filter((s) => !stepStatuses.has(s.stepId));
      await Promise.all(
        pendingSteps.map((s) =>
          chrome.runtime.sendMessage({
            type: RuntimeMessageTypes.humanVerifyFeedbackSubmit,
            payload: {
              taskId: task.taskId,
              traceId: task.traceId,
              stepId: s.stepId,
              result: 'suspended',
              comment: comment.trim() ? comment.trim() : undefined,
              ts: Date.now(),
            } satisfies HumanFeedback,
          })
        )
      );
      const next = new Map(stepStatuses);
      for (const s of pendingSteps) {
        next.set(s.stepId, 'suspended');
      }
      setStepStatuses(next);
      setPhase('suspended');
      await chrome.runtime.sendMessage({
        type: RuntimeMessageTypes.humanVerifyCompleted,
        payload: { taskId: task.taskId, traceId: task.traceId, status: 'suspended' },
      });
    } catch (e) {
      console.error('Failed to suspend:', e);
    }
  };

  const markCompleted = async () => {
    if (!task) return;
    try {
      await chrome.runtime.sendMessage({
        type: RuntimeMessageTypes.humanVerifyCompleted,
        payload: { taskId: task.taskId, traceId: task.traceId, status: 'completed' },
      });
      setPhase('completed');
    } catch (e) {
      console.error('Failed to mark completed:', e);
    }
  };

  const clearTask = () => {
    setTask(null);
    setStepStatuses(new Map());
    setComment('');
    setPhase('in_progress');
  };

  const allStepsDone = task
    ? task.steps.every((s) => {
        const st = stepStatuses.get(s.stepId);
        return st && st !== 'pending';
      })
    : false;

  const elapsedSec = Math.round((Date.now() - startTime) / 1000);
  const formatElapsed = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m${s}s`;
  };

  const phaseLabel: Record<TaskPhase, string> = {
    in_progress: '进行中',
    completed: '已完成',
    suspended: '已挂起',
  };

  const phaseColor: Record<TaskPhase, string> = {
    in_progress: 'warning',
    completed: 'success',
    suspended: 'default',
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
                  <Space size={8}>
                    <Typography.Text type="secondary">taskId: {task.taskId}</Typography.Text>
                    <Typography.Text type="secondary">traceId: {task.traceId}</Typography.Text>
                    <Typography.Text type="secondary">{formatElapsed(elapsedSec)}</Typography.Text>
                  </Space>
                </Space>
              }
            />

            <Space>
              <Typography.Text type="secondary">
                状态：{phaseLabel[phase]}
              </Typography.Text>
              <Divider type="vertical" />
              <Typography.Text type="secondary">
                进度：{task.steps.filter((s) => stepStatuses.has(s.stepId)).length}/{task.steps.length}
              </Typography.Text>
            </Space>

            <List
              size="small"
              bordered
              dataSource={task.steps ?? []}
              renderItem={(step, idx) => {
                const status = stepStatuses.get(step.stepId);
                const done = !!status && status !== 'pending';
                return (
                  <List.Item style={{ opacity: done ? 0.6 : 1 }}>
                    <Space direction="vertical" size={6} style={{ width: '100%' }}>
                      <Space direction="vertical" size={2}>
                        <Typography.Text strong>
                          {idx + 1}. {step.instruction}
                          {done && (
                            <Typography.Text
                              type={
                                status === 'passed'
                                  ? 'success'
                                  : status === 'failed'
                                    ? 'danger'
                                    : 'warning'
                              }
                              style={{ marginLeft: 8 }}
                            >
                              [
                              {status === 'passed'
                                ? '通过'
                                : status === 'failed'
                                  ? '失败'
                                  : status === 'suspended'
                                    ? '挂起'
                                    : status === 'blocked'
                                      ? '阻塞'
                                      : status}
                              ]
                            </Typography.Text>
                          )}
                        </Typography.Text>
                        {step.expected ? <Typography.Text type="secondary">预期：{step.expected}</Typography.Text> : null}
                        <Typography.Text type="secondary">
                          stepId: {step.stepId} · {step.type}
                        </Typography.Text>
                      </Space>
                      {!done && phase === 'in_progress' && (
                        <Space>
                          <Button size="small" type="primary" onClick={() => void submitStep(step.stepId, 'passed')}>
                            通过
                          </Button>
                          <Button size="small" danger onClick={() => void submitStep(step.stepId, 'failed')}>
                            失败
                          </Button>
                        </Space>
                      )}
                    </Space>
                  </List.Item>
                );
              }}
            />

            <Input.TextArea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="备注（可选）：例如点击无反应、结果不对、报错信息等"
              autoSize={{ minRows: 2, maxRows: 4 }}
            />

            <Divider style={{ margin: '4px 0' }} />

            <Space wrap>
              {phase === 'in_progress' && !allStepsDone && (
                <>
                  <Button
                    type="dashed"
                    onClick={() => void submitSuspend()}
                  >
                    ⏸ 挂起（耗时较长，稍后继续）
                  </Button>
                </>
              )}
              {phase === 'in_progress' && (
                <Button
                  type="primary"
                  disabled={!allStepsDone}
                  onClick={() => void markCompleted()}
                >
                  ✓ 验证完毕，提交给 AI
                </Button>
              )}
              {phase === 'completed' && (
                <Alert
                  type="success"
                  message="验证已完毕，AI 正在处理结果..."
                  showIcon
                  style={{ width: '100%' }}
                />
              )}
              {phase === 'suspended' && (
                <Alert
                  type="warning"
                  message="任务已挂起，未完成步骤标记为 suspended"
                  showIcon
                  style={{ width: '100%' }}
                />
              )}
              {(phase === 'completed' || phase === 'suspended') && (
                <Button danger size="small" onClick={clearTask}>
                  清除任务
                </Button>
              )}
            </Space>
          </Space>
        )}
      </Card>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
