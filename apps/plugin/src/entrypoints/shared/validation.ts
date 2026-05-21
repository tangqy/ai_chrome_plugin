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
  ts: number;
};

export const RuntimeMessageTypes = {
  humanVerifyPromptSet: 'HUMAN_VERIFY_PROMPT_SET',
  humanVerifyPromptGet: 'HUMAN_VERIFY_PROMPT_GET',
  humanVerifyPromptPush: 'HUMAN_VERIFY_PROMPT_PUSH',
  humanVerifyFeedbackSubmit: 'HUMAN_VERIFY_FEEDBACK_SUBMIT',
} as const;

export type RuntimeMessage =
  | { type: typeof RuntimeMessageTypes.humanVerifyPromptSet; payload: { task: HumanVerifyTask | null } }
  | { type: typeof RuntimeMessageTypes.humanVerifyPromptGet }
  | { type: typeof RuntimeMessageTypes.humanVerifyPromptPush; payload: HumanVerifyTask | null }
  | { type: typeof RuntimeMessageTypes.humanVerifyFeedbackSubmit; payload: HumanFeedback };

export function isHumanVerifyTask(input: unknown): input is HumanVerifyTask {
  const v = input as HumanVerifyTask;
  return (
    !!v &&
    typeof v === 'object' &&
    typeof v.taskId === 'string' &&
    typeof v.traceId === 'string' &&
    typeof v.title === 'string' &&
    Array.isArray(v.steps)
  );
}

export function extractHumanVerifyTaskFromBridgeMessage(msg: unknown): HumanVerifyTask | null {
  const m = msg as { type?: unknown; payload?: unknown; task?: unknown };
  const type = typeof m?.type === 'string' ? m.type : '';
  const direct = (msg as { task?: unknown })?.task;
  if (isHumanVerifyTask(direct)) return direct;

  const payload = m?.payload as { task?: unknown } | undefined;
  if (payload?.task && isHumanVerifyTask(payload.task)) return payload.task;

  if (type === 'validation_request_human_action' && payload?.task && isHumanVerifyTask(payload.task)) return payload.task;
  if (type === 'human_verify_prompt' && payload?.task && isHumanVerifyTask(payload.task)) return payload.task;

  return null;
}
