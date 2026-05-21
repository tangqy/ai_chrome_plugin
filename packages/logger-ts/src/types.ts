export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogKind =
  | 'ai_trace'
  | 'ai_assert'
  | 'ui_action'
  | 'network'
  | 'console'
  | 'manual_feedback'
  | 'task_state'
  | 'artifact'
  | 'custom';

export type LogSource = 'page' | 'content' | 'plugin-bg' | 'popup' | 'gui' | 'unknown';

export type LogEvent = {
  id: string;
  traceId: string;
  spanId?: string;
  parentTraceId?: string;
  taskId?: string;
  stepId?: string;
  sessionId?: string;
  source: LogSource;
  module: string;
  kind: LogKind;
  level: LogLevel;
  action: string;
  message: string;
  ts: number;
  attrs?: Record<string, unknown>;
  tags?: string[];
};

export type AssertPayload = {
  name: string;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
};

export type ManualFeedbackPayload = {
  result: 'passed' | 'failed' | 'blocked' | 'suspended';
  exceptionType?:
    | 'element_not_found'
    | 'click_no_response'
    | 'wrong_result'
    | 'network_error'
    | 'timeout'
    | 'other';
  comment?: string;
};

export type LogSink = (event: LogEvent) => void | Promise<void>;

export type LoggerContext = {
  traceId: string;
  spanId?: string;
  parentTraceId?: string;
  taskId?: string;
  stepId?: string;
  sessionId?: string;
  source?: LogSource;
  module?: string;
  tags?: string[];
};

export type CreateLoggerOptions = {
  app?: string;
  source?: LogSource;
  sink?: LogSink;
  defaultModule?: string;
  context?: Partial<LoggerContext>;
};

export type Logger = {
  withContext: (ctx: Partial<LoggerContext>) => Logger;
  event: (
    input: Omit<LogEvent, 'id' | 'ts' | 'traceId' | 'source' | 'module'> & {
      ts?: number;
      traceId?: string;
      source?: LogSource;
      module?: string;
    }
  ) => string | undefined;
  trace: (
    module: string,
    action: string,
    message?: string,
    attrs?: Record<string, unknown>,
    ctx?: Partial<LoggerContext>
  ) => string | undefined;
  debug: (
    module: string,
    action: string,
    message?: string,
    attrs?: Record<string, unknown>,
    ctx?: Partial<LoggerContext>
  ) => string | undefined;
  info: (
    module: string,
    action: string,
    message?: string,
    attrs?: Record<string, unknown>,
    ctx?: Partial<LoggerContext>
  ) => string | undefined;
  warn: (
    module: string,
    action: string,
    message?: string,
    attrs?: Record<string, unknown>,
    ctx?: Partial<LoggerContext>
  ) => string | undefined;
  error: (
    module: string,
    action: string,
    message?: string,
    attrs?: Record<string, unknown>,
    ctx?: Partial<LoggerContext>
  ) => string | undefined;
  assert: (
    module: string,
    name: string,
    passed: boolean,
    expected?: unknown,
    actual?: unknown,
    ctx?: Partial<LoggerContext>
  ) => string | undefined;
  manualFeedback: (
    module: string,
    result: ManualFeedbackPayload['result'],
    exceptionType?: ManualFeedbackPayload['exceptionType'],
    comment?: string,
    ctx?: Partial<LoggerContext>
  ) => string | undefined;
};

