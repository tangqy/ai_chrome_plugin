import React from 'react';
import { Button, Input, List, Space, Typography } from 'antd';
import type { AutomationTask } from '../../types';

type Props = {
  automationTasks: AutomationTask[];
  onUpsertTask: (name: string, cron: string, script: string) => void;
  onDeleteTask: (id: string) => void;
};

export function AutomationSection({ automationTasks, onUpsertTask, onDeleteTask }: Props) {
  const [taskName, setTaskName] = React.useState('demo-task');
  const [taskCron, setTaskCron] = React.useState('*/5 * * * *');
  const [taskScript, setTaskScript] = React.useState("return 'ok';");

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Input value={taskName} onChange={(e) => setTaskName(e.target.value)} placeholder="任务名" />
      <Input value={taskCron} onChange={(e) => setTaskCron(e.target.value)} placeholder="cron: */5 * * * *" />
      <Input.TextArea value={taskScript} onChange={(e) => setTaskScript(e.target.value)} autoSize={{ minRows: 2, maxRows: 5 }} placeholder="return 'ok';" />
      <Button onClick={() => onUpsertTask(taskName, taskCron, taskScript)} block>保存任务</Button>
      <List
        size="small"
        dataSource={automationTasks}
        locale={{ emptyText: '暂无任务' }}
        renderItem={(task) => (
          <List.Item actions={[<a key="del" onClick={() => onDeleteTask(task.id)}>删除</a>]}> 
            <Space direction="vertical" size={1}>
              <Typography.Text strong>{task.name}</Typography.Text>
              <Typography.Text type="secondary">{task.cron} | {task.lastRunAt ? new Date(task.lastRunAt).toLocaleTimeString() : '-'}</Typography.Text>
              <Typography.Text type="secondary">{task.lastResult ?? '-'}</Typography.Text>
            </Space>
          </List.Item>
        )}
      />
    </Space>
  );
}
