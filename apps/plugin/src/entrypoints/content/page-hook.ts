import Mock from 'mockjs';

type MockRule = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  scene: string;
  requestMatch: {
    method: string;
    pathPattern: string;
    queryMatch?: Record<string, string>;
    headerMatch?: Record<string, string>;
  };
  requestHeaderPatch?: Record<string, string>;
  responseBodyMode: 'fixed' | 'mockjs' | 'script';
  responseBodyRaw?: string;
  mockjsTemplate?: string;
  responseHeaders?: Record<string, string>;
  status: number;
  delayMs: number;
  script: string;
  imports: string[];
};

(() => {
  const g = window as typeof window & {
    __wujieMockPatched?: boolean;
    __wujieMockRules?: MockRule[];
  };

  if (g.__wujieMockPatched) return;
  g.__wujieMockPatched = true;
  g.__wujieMockRules = [];

  const rawFetch = window.fetch.bind(window);
  const RawXHR = window.XMLHttpRequest;

  function tryJson(input: string): unknown {
    try {
      return JSON.parse(input);
    } catch {
      return input;
    }
  }

  function asLowerRecord(headers: HeadersInit | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    if (!headers) return out;
    if (headers instanceof Headers) {
      headers.forEach((v, k) => { out[k.toLowerCase()] = v; });
      return out;
    }
    if (Array.isArray(headers)) {
      for (const [k, v] of headers) out[String(k).toLowerCase()] = String(v);
      return out;
    }
    for (const [k, v] of Object.entries(headers)) out[k.toLowerCase()] = String(v);
    return out;
  }

  function pathMatches(pathname: string, pattern: string): boolean {
    try {
      return new RegExp(pattern).test(pathname);
    } catch {
      return pathname.includes(pattern);
    }
  }

  function matchRule(url: string, method: string, headers: Record<string, string>) {
    const pathname = new URL(url, location.origin).pathname;
    const rules = (g.__wujieMockRules ?? [])
      .filter((r) => r.enabled)
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

    return rules.find((rule) => {
      const m = (rule.requestMatch?.method || 'ALL').toUpperCase();
      if (m !== 'ALL' && m !== method.toUpperCase()) return false;
      if (!pathMatches(pathname, String(rule.requestMatch?.pathPattern ?? '/'))) return false;
      const headerMatch = rule.requestMatch?.headerMatch ?? {};
      for (const [k, v] of Object.entries(headerMatch)) {
        if ((headers[k.toLowerCase()] ?? '') !== String(v)) return false;
      }
      return true;
    });
  }

  async function runScript(rule: MockRule, context: Record<string, unknown>) {
    const imports: Record<string, unknown> = {};
    const allowDomains = ['esm.sh', 'cdn.jsdelivr.net', 'unpkg.com'];
    for (const item of rule.imports ?? []) {
      const [aliasRaw, urlRaw] = item.split('@');
      const alias = (aliasRaw || '').trim();
      const url = (urlRaw || '').trim();
      if (!alias || !url) continue;
      try {
        const host = new URL(url).hostname;
        if (!allowDomains.includes(host)) {
          imports[alias] = { __error: `blocked domain: ${host}` };
          continue;
        }
        imports[alias] = await import(/* @vite-ignore */ url);
      } catch {
        imports[alias] = null;
      }
    }

    const runner = new Function('context', 'imports', `${rule.script}`) as (
      context: Record<string, unknown>,
      imports: Record<string, unknown>
    ) => unknown;

    return Promise.race([
      Promise.resolve(runner(context, imports)),
      new Promise((_, reject) => setTimeout(() => reject(new Error('mock script timeout')), 1500))
    ]);
  }

  async function buildMockBody(rule: MockRule, context: Record<string, unknown>) {
    if (rule.responseBodyMode === 'mockjs') {
      return Mock.mock(tryJson(String(rule.mockjsTemplate ?? '{}')) as object);
    }
    if (rule.responseBodyMode === 'script') {
      return runScript(rule, context);
    }
    return tryJson(String(rule.responseBodyRaw ?? '{}'));
  }

  function buildResponseHeaders(rule: MockRule) {
    const headers: Record<string, string> = {
      'content-type': 'application/json; charset=utf-8',
      'x-wujie-mock': '1'
    };
    const ext = rule.responseHeaders ?? {};
    for (const [k, v] of Object.entries(ext)) headers[k] = String(v);
    return headers;
  }

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
    const reqHeaders = asLowerRecord(init?.headers);
    const rule = matchRule(url, method, reqHeaders);
    if (!rule) return rawFetch(input, init);

    const patchedHeaders = { ...reqHeaders, ...(rule.requestHeaderPatch ?? {}) };
    const context = { url, method, headers: patchedHeaders, body: init?.body, now: Date.now() };

    try {
      const body = await buildMockBody(rule, context);
      if (rule.delayMs > 0) await new Promise((r) => setTimeout(r, rule.delayMs));
      const payload = typeof body === 'string' ? body : JSON.stringify(body ?? null);
      return new Response(payload, { status: Number(rule.status || 200), headers: buildResponseHeaders(rule) });
    } catch {
      return rawFetch(input, init);
    }
  };

  class MockXHR extends RawXHR {
    private _url = '';
    private _method = 'GET';
    private _body: Document | XMLHttpRequestBodyInit | null = null;

    open(method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null): void {
      this._method = (method || 'GET').toUpperCase();
      this._url = typeof url === 'string' ? url : url.toString();
      super.open(method, url, async ?? true, username ?? undefined, password ?? undefined);
    }

    send(body?: Document | XMLHttpRequestBodyInit | null): void {
      this._body = body ?? null;
      const rule = matchRule(this._url, this._method, {});
      if (!rule) {
        super.send(body ?? null);
        return;
      }

      const finish = async () => {
        try {
          const result = await buildMockBody(rule, {
            url: this._url,
            method: this._method,
            body: this._body,
            headers: rule.requestHeaderPatch ?? {},
            now: Date.now()
          });
          if (rule.delayMs > 0) await new Promise((r) => setTimeout(r, rule.delayMs));
          const text = typeof result === 'string' ? result : JSON.stringify(result ?? null);

          Object.defineProperty(this, 'readyState', { value: 4, configurable: true });
          Object.defineProperty(this, 'status', { value: Number(rule.status || 200), configurable: true });
          Object.defineProperty(this, 'responseText', { value: text, configurable: true });
          Object.defineProperty(this, 'response', { value: text, configurable: true });
          Object.defineProperty(this, 'getResponseHeader', {
            value: (name: string) => buildResponseHeaders(rule)[name.toLowerCase()] ?? null,
            configurable: true
          });

          this.dispatchEvent(new Event('readystatechange'));
          this.dispatchEvent(new Event('load'));
          this.dispatchEvent(new Event('loadend'));
        } catch {
          super.send(body ?? null);
        }
      };

      void finish();
    }
  }

  window.XMLHttpRequest = MockXHR as unknown as typeof XMLHttpRequest;

  window.addEventListener('message', (event) => {
    const data = event.data as { source?: string; type?: string; payload?: unknown };
    if (data?.source !== 'wujie-ai-content') return;
    if (data.type === 'WUJIE_MOCK_RULES_SET') {
      const list = Array.isArray(data.payload) ? data.payload : [];
      g.__wujieMockRules = list as MockRule[];
    }
  });
})();
