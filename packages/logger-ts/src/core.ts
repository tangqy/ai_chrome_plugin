import { isLogEnabled } from './config';
import type { AssertPayload, CreateLoggerOptions, LogEvent, LogLevel, LogSink, Logger, LoggerContext, LogKind, ManualFeedbackPayload } from './types';

let globalSink: LogSink | null = null;

export function setLogSink(sink: LogSink | null) {
  globalSink = sink;
}

export function generateId(prefix: string) {
  const base =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${base.replaceAll('-', '')}`;
}

export function generateTraceId() {
  return generateId('tr');
}

export function mergeContext(
  base: Partial<LoggerContext> | null | undefined,
  next: Partial<LoggerContext> | null | undefined
): LoggerContext {
  const traceId = next?.traceId || base?.traceId;
  return {
    traceId: traceId ? traceId : generateTraceId(),
    spanId: next?.spanId ?? base?.spanId,
    parentTraceId: next?.parentTraceId ?? base?.parentTraceId,
    taskId: next?.taskId ?? base?.taskId,
    stepId: next?.stepId ?? base?.stepId,
    sessionId: next?.sessionId ?? base?.sessionId,
    source: next?.source ?? base?.source,
    module: next?.module ?? base?.module,
    tags: [...(base?.tags ?? []), ...(next?.tags ?? [])],
  };
}

export function defaultSinkFactory(app?: string): LogSink {
  return (event) => {
    const prefix = app ? `[${app}]` : '';
    const base = `${prefix}[${event.traceId}][${event.kind}][${event.module}.${event.action}]`;
    if (event.level === 'error') console.error(base, event.message, event.attrs ?? {});
    else if (event.level === 'warn') console.warn(base, event.message, event.attrs ?? {});
    else if (event.level === 'debug') console.debug(base, event.message, event.attrs ?? {});
    else console.log(base, event.message, event.attrs ?? {});
  };
}

function safeCallSink(sink: LogSink, event: LogEvent) {
  try {
    const ret = sink(event);
    if (ret && typeof (ret as Promise<void>).catch === 'function') (ret as Promise<void>).catch(() => {});
  } catch {}
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const baseCtx: Partial<LoggerContext> = {
    traceId: options.context?.traceId,
    source: options.source ?? 'unknown',
    module: options.defaultModule ?? 'app',
    ...options.context,
  };

  const defaultSink = defaultSinkFactory(options.app);

  function resolveSink() {
    return options.sink ?? globalSink ?? defaultSink;
  }

  function emit(
    level: LogLevel,
    kind: LogKind,
    module: string,
    action: string,
    message: string,
    attrs: Record<string, unknown> | undefined,
    ctx?: Partial<LoggerContext>
  ) {
    if (!isLogEnabled(level)) return undefined;
    const merged = mergeContext(baseCtx, ctx ?? null);
    const event: LogEvent = {
      id: generateId('ev'),
      traceId: merged.traceId,
      spanId: merged.spanId,
      parentTraceId: merged.parentTraceId,
      taskId: merged.taskId,
      stepId: merged.stepId,
      sessionId: merged.sessionId,
      source: merged.source ?? 'unknown',
      module: module || merged.module || 'app',
      kind,
      level,
      action,
      message,
      ts: Date.now(),
      attrs,
      tags: merged.tags?.length ? merged.tags : undefined,
    };
    safeCallSink(resolveSink(), event);
    return event.id;
  }

  return {
    withContext(ctx) {
      const nextCtx = mergeContext(baseCtx, ctx);
      return createLogger({ ...options, context: nextCtx });
    },
    event(input) {
      if (!isLogEnabled(input.level)) return undefined;
      const merged = mergeContext(baseCtx, {
        traceId: input.traceId,
        source: input.source,
        module: input.module,
      });
      const event: LogEvent = {
        id: generateId('ev'),
        traceId: merged.traceId,
        spanId: merged.spanId,
        parentTraceId: merged.parentTraceId,
        taskId: merged.taskId,
        stepId: merged.stepId,
        sessionId: merged.sessionId,
        source: merged.source ?? 'unknown',
        module: merged.module ?? 'app',
        kind: input.kind,
        level: input.level,
        action: input.action,
        message: input.message,
        ts: input.ts ?? Date.now(),
        attrs: input.attrs,
        tags: merged.tags?.length ? merged.tags : undefined,
      };
      safeCallSink(resolveSink(), event);
      return event.id;
    },
    trace(module, action, message = '', attrs, ctx) {
      return emit('info', 'ai_trace', module, action, message, attrs, ctx);
    },
    debug(module, action, message = '', attrs, ctx) {
      return emit('debug', 'custom', module, action, message, attrs, ctx);
    },
    info(module, action, message = '', attrs, ctx) {
      return emit('info', 'custom', module, action, message, attrs, ctx);
    },
    warn(module, action, message = '', attrs, ctx) {
      return emit('warn', 'custom', module, action, message, attrs, ctx);
    },
    error(module, action, message = '', attrs, ctx) {
      return emit('error', 'custom', module, action, message, attrs, ctx);
    },
    assert(module, name, passed, expected, actual, ctx) {
      return emit(
        passed ? 'info' : 'error',
        'ai_assert',
        module,
        name,
        passed ? 'assert passed' : 'assert failed',
        { assert: { name, passed, expected, actual } satisfies AssertPayload },
        ctx
      );
    },
    manualFeedback(module, result, exceptionType, comment, ctx) {
      return emit(
        result === 'passed' ? 'info' : 'warn',
        'manual_feedback',
        module,
        result,
        comment ?? '',
        { feedback: { result, exceptionType, comment } satisfies ManualFeedbackPayload },
        ctx
      );
    },
  };
}
