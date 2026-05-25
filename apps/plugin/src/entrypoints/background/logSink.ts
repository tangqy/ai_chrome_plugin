import { setLogSink, type LogEvent, isLogEnabled } from '@wujie/logger-ts';
import { RuntimeMessageTypes } from '../shared/validation';

let sinkInstalled = false;

export function installLogSink() {
  if (sinkInstalled) return;
  sinkInstalled = true;

  setLogSink((event: LogEvent) => {
    if (!isLogEnabled(event.level)) return;

    try {
      void chrome.runtime.sendMessage({
        type: RuntimeMessageTypes.logEventForward,
        payload: {
          id: event.id,
          traceId: event.traceId,
          taskId: event.taskId || undefined,
          stepId: event.stepId || undefined,
          source: event.source,
          module: event.module,
          kind: event.kind,
          level: event.level,
          action: event.action,
          message: event.message,
          ts: event.ts,
          attrs: event.attrs || undefined,
        },
      }).catch(() => {});
    } catch {}
  });
}
