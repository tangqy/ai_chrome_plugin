import React from 'react';
import { Collapse } from 'antd';
import type { AutomationTask, NetworkEntry } from '../types';
import { TextToolsSection } from '../components/toolbox/TextToolsSection';
import { DiffSection } from '../components/toolbox/DiffSection';
import { UtilitySection } from '../components/toolbox/UtilitySection';
import { AutomationSection } from '../components/toolbox/AutomationSection';

type Props = {
  runtimeConnected: boolean;
  proxyMode: 'system' | 'direct';
  networkRecordingEnabled: boolean;
  networkEntryCount: number;
  networkEntries: NetworkEntry[];
  automationTasks: AutomationTask[];
  onSetProxy: (mode: 'system' | 'direct') => void;
  onSetNetworkRecording: (enabled: boolean) => void;
  onClearNetworkRecording: () => void;
  onExportNetworkCurl: () => void;
  curlOutput: string;
  onUpsertTask: (name: string, cron: string, script: string) => void;
  onDeleteTask: (id: string) => void;
};

export function ToolboxTab(props: Props) {
  const {
    runtimeConnected,
    proxyMode,
    networkRecordingEnabled,
    networkEntryCount,
    networkEntries,
    automationTasks,
    onSetProxy,
    onSetNetworkRecording,
    onClearNetworkRecording,
    onExportNetworkCurl,
    curlOutput,
    onUpsertTask,
    onDeleteTask
  } = props;

  return (
    <Collapse
      size="small"
      items={[
        {
          key: 'text-tools',
          label: '文本工具（Unicode / JSON）',
          children: <TextToolsSection runtimeConnected={runtimeConnected} />
        },
        {
          key: 'diff-tool',
          label: 'Diff 对比（Git 风格）',
          children: <DiffSection runtimeConnected={runtimeConnected} />
        },
        {
          key: 'utility-tools',
          label: '实用工具（二维码 / 时间 / 代理 / Network）',
          children: (
            <UtilitySection
              proxyMode={proxyMode}
              networkRecordingEnabled={networkRecordingEnabled}
              networkEntryCount={networkEntryCount}
              networkEntries={networkEntries}
              onSetProxy={onSetProxy}
              onSetNetworkRecording={onSetNetworkRecording}
              onClearNetworkRecording={onClearNetworkRecording}
              onExportNetworkCurl={onExportNetworkCurl}
              curlOutput={curlOutput}
            />
          )
        },
        {
          key: 'automation-tools',
          label: '自动化任务（Cron + JS）',
          children: <AutomationSection automationTasks={automationTasks} onUpsertTask={onUpsertTask} onDeleteTask={onDeleteTask} />
        }
      ]}
    />
  );
}
