import type { LoggerContext } from './types';
import { createLogger } from './core';

export const aiLogger = createLogger({ app: 'ai', source: 'unknown', defaultModule: 'app' });

export function aiTrace(
  module: string,
  action: string,
  message?: string,
  attrs?: Record<string, unknown>,
  ctx?: Partial<LoggerContext>
) {
  return aiLogger.trace(module, action, message, attrs, ctx);
}

export function aiAssert(
  module: string,
  name: string,
  passed: boolean,
  expected?: unknown,
  actual?: unknown,
  ctx?: Partial<LoggerContext>
) {
  return aiLogger.assert(module, name, passed, expected, actual, ctx);
}

export function aiManualFeedback(
  module: string,
  result: 'passed' | 'failed' | 'blocked' | 'suspended',
  exceptionType?:
    | 'element_not_found'
    | 'click_no_response'
    | 'wrong_result'
    | 'network_error'
    | 'timeout'
    | 'other',
  comment?: string,
  ctx?: Partial<LoggerContext>
) {
  return aiLogger.manualFeedback(module, result, exceptionType, comment, ctx);
}

