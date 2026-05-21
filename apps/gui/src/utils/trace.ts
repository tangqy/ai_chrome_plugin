export interface TraceContext {
  traceId: string;
  spanId?: string;
  parentTraceId?: string;
}

export function generateTraceId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

export function getCurrentTrace(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (window.__TAURI__) {
      window.__TAURI__.core.invoke('get_current_trace')
        .then(resolve)
        .catch(reject);
    } else {
      resolve(generateTraceId());
    }
  });
}

export function extractTraceFromResponse(response: Response): TraceContext | null {
  const traceId = response.headers.get('X-Trace-Id');
  const spanId = response.headers.get('X-Span-Id');
  const parentTraceId = response.headers.get('X-Parent-Trace-Id');
  
  if (!traceId) return null;
  
  return {
    traceId,
    spanId: spanId || undefined,
    parentTraceId: parentTraceId || undefined,
  };
}

export function injectTraceHeader(traceId?: string): Record<string, string> {
  return {
    'X-Trace-Id': traceId || generateTraceId(),
  };
}

export async function fetchWithTrace(
  url: string,
  options: RequestInit = {},
  traceId?: string
): Promise<Response> {
  const headers = injectTraceHeader(traceId);
  
  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(options.headers)) {
      options.headers.forEach(([key, value]) => {
        headers[key] = value;
      });
    } else {
      Object.assign(headers, options.headers);
    }
  }
  
  const response = await fetch(url, {
    ...options,
    headers,
  });
  
  return response;
}

export function logWithTrace(
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  traceId?: string
) {
  const finalTraceId = traceId || generateTraceId();
  const logMessage = `[${finalTraceId}] ${message}`;
  
  switch (level) {
    case 'error':
      console.error(logMessage);
      break;
    case 'warn':
      console.warn(logMessage);
      break;
    case 'debug':
      console.debug(logMessage);
      break;
    default:
      console.log(logMessage);
  }
  
  if (window.__TAURI__) {
    window.__TAURI__.core.invoke('write_log', {
      entry: {
        level,
        message,
        source: 'frontend',
      },
    }).catch(console.error);
  }
  
  return finalTraceId;
}
