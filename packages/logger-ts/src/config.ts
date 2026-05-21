import type { LogLevel } from './types';

export type LogConfig = {
  enabled: boolean;
  level: LogLevel;
};

export const LOG_STORAGE_KEYS = {
  enabled: 'wujie:logger:enabled',
  level: 'wujie:logger:level',
} as const;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

let inited = false;
let currentConfig: LogConfig = {
  enabled: false,
  level: 'info',
};

function safeGetLocalStorage() {
  try {
    const ls = (globalThis as unknown as { localStorage?: Storage }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

function guessIsDev() {
  try {
    const p = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
    if (p?.env?.NODE_ENV) return p.env.NODE_ENV === 'development';
  } catch {}
  try {
    const v = (globalThis as unknown as { __DEV__?: boolean }).__DEV__;
    if (typeof v === 'boolean') return v;
  } catch {}
  try {
    const loc = (globalThis as unknown as { location?: Location }).location;
    const host = loc?.hostname;
    if (host) return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  } catch {}
  return false;
}

function normalizeLevel(level: string | null | undefined): LogLevel | null {
  if (!level) return null;
  const v = level.toLowerCase();
  if (v === 'debug' || v === 'info' || v === 'warn' || v === 'error') return v;
  return null;
}

function normalizeEnabled(v: string | null | undefined): boolean | null {
  if (v == null) return null;
  if (v === '1' || v.toLowerCase() === 'true') return true;
  if (v === '0' || v.toLowerCase() === 'false') return false;
  return null;
}

function initConfig() {
  const ls = safeGetLocalStorage();
  if (!ls) {
    currentConfig = { enabled: guessIsDev(), level: 'info' };
    inited = true;
    return;
  }

  const enabled = normalizeEnabled(ls.getItem(LOG_STORAGE_KEYS.enabled));
  const level = normalizeLevel(ls.getItem(LOG_STORAGE_KEYS.level));

  currentConfig = {
    enabled: enabled ?? guessIsDev(),
    level: level ?? 'info',
  };
  inited = true;
}

function ensureInited() {
  if (inited) return;
  initConfig();
}

export function getLogConfig(): LogConfig {
  ensureInited();
  return { ...currentConfig };
}

export function setLogConfig(next: Partial<LogConfig> & { persist?: boolean }) {
  ensureInited();
  currentConfig = {
    enabled: next.enabled ?? currentConfig.enabled,
    level: next.level ?? currentConfig.level,
  };

  if (!next.persist) return;
  const ls = safeGetLocalStorage();
  if (!ls) return;
  try {
    ls.setItem(LOG_STORAGE_KEYS.enabled, currentConfig.enabled ? '1' : '0');
    ls.setItem(LOG_STORAGE_KEYS.level, currentConfig.level);
  } catch {}
}

export function isLogEnabled(level?: LogLevel) {
  ensureInited();
  if (!currentConfig.enabled) return false;
  if (!level) return true;
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentConfig.level];
}

