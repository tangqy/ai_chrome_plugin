export type ValidationStepType = 'navigate' | 'click' | 'input' | 'observe' | 'mock_trigger';

export type HumanVerifyStep = {
  stepId: string;
  type: ValidationStepType;
  instruction: string;
  expected?: string;
  selectorHint?: string;
  target?: string;
};

export type HumanVerifyTask = {
  taskId: string;
  traceId: string;
  title: string;
  steps: HumanVerifyStep[];
};

export type HumanFeedback = {
  taskId: string;
  traceId: string;
  stepId: string;
  result: 'passed' | 'failed' | 'blocked' | 'suspended';
  exceptionType?:
    | 'element_not_found'
    | 'click_no_response'
    | 'wrong_result'
    | 'network_error'
    | 'timeout'
    | 'other';
  comment?: string;
  screenshots?: string[];
  ts: number;
};

export const RuntimeMessageTypes = {
  humanVerifyPromptSet: 'HUMAN_VERIFY_PROMPT_SET',
  humanVerifyPromptGet: 'HUMAN_VERIFY_PROMPT_GET',
  humanVerifyPromptPush: 'HUMAN_VERIFY_PROMPT_PUSH',
  humanVerifyFeedbackSubmit: 'HUMAN_VERIFY_FEEDBACK_SUBMIT',
  humanVerifyCompleted: 'HUMAN_VERIFY_COMPLETED',
  logEventForward: 'LOG_EVENT_FORWARD',
} as const;

export type RuntimeMessage =
  | { type: typeof RuntimeMessageTypes.humanVerifyPromptSet; payload: { task: HumanVerifyTask | null } }
  | { type: typeof RuntimeMessageTypes.humanVerifyPromptGet }
  | { type: typeof RuntimeMessageTypes.humanVerifyPromptPush; payload: HumanVerifyTask | null }
  | { type: typeof RuntimeMessageTypes.humanVerifyFeedbackSubmit; payload: HumanFeedback }
  | { type: typeof RuntimeMessageTypes.humanVerifyCompleted; payload: { taskId: string; traceId: string; status: 'completed' | 'suspended' } }
  | { type: typeof RuntimeMessageTypes.logEventForward; payload: Record<string, unknown> };

export function isHumanVerifyTask(input: unknown): input is HumanVerifyTask {
  const v = input as any;
  if (!v || typeof v !== 'object') return false;
  
  const hasTaskId = typeof v.taskId === 'string' || typeof v.task_id === 'string';
  const hasTraceId = typeof v.traceId === 'string' || typeof v.trace_id === 'string';
  
  return (
    hasTaskId &&
    hasTraceId &&
    typeof v.title === 'string' &&
    Array.isArray(v.steps)
  );
}

export function extractHumanVerifyTaskFromBridgeMessage(msg: unknown): HumanVerifyTask | null {
  const m = msg as { type?: unknown; payload?: unknown; task?: unknown };
  const type = typeof m?.type === 'string' ? m.type : '';
  
  // 辅助函数：把带有 snake_case 的对象转成 camelCase 的 HumanVerifyTask
  const normalizeTask = (input: any): HumanVerifyTask | null => {
    if (!isHumanVerifyTask(input)) return null;
    const rawTask = input as any;
    
    return {
      taskId: String(rawTask.taskId || rawTask.task_id || ''),
      traceId: String(rawTask.traceId || rawTask.trace_id || ''),
      title: rawTask.title,
      steps: rawTask.steps.map((s: any) => ({
        stepId: s.stepId || s.step_id,
        type: s.type || s.typ,
        instruction: s.instruction,
        expected: s.expected,
        selectorHint: s.selectorHint || s.selector_hint,
        target: s.target
      }))
    };
  };

  const direct = (msg as { task?: unknown })?.task;
  const directTask = normalizeTask(direct);
  if (directTask) return directTask;

  const payload = m?.payload as { task?: unknown } | undefined;
  const payloadTask = normalizeTask(payload?.task);
  if (payloadTask) return payloadTask;

  return null;
}
