import { broadcastSnapshot, state } from './state';

export function initAutomationTicker() {
  chrome.alarms.create('wujie-ai-automation-tick', { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== 'wujie-ai-automation-tick') return;
    const now = new Date();
    for (const task of state.automationTasks) {
      if (!task.enabled) continue;
      if (!cronMatches(task.cron, now)) continue;
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function(task.script);
        const result = fn();
        task.lastRunAt = Date.now();
        task.lastResult = result === undefined ? 'ok' : String(result);
      } catch (err) {
        task.lastRunAt = Date.now();
        task.lastResult = `error: ${err instanceof Error ? err.message : 'unknown'}`;
      }
    }
    broadcastSnapshot();
  });
}

function cronMatches(cron: string, now: Date): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [min, hour, day, mon, week] = parts;
  return (
    partMatches(min, now.getMinutes()) &&
    partMatches(hour, now.getHours()) &&
    partMatches(day, now.getDate()) &&
    partMatches(mon, now.getMonth() + 1) &&
    partMatches(week, now.getDay())
  );
}

function partMatches(expr: string, value: number): boolean {
  if (expr === '*') return true;
  if (/^\d+$/.test(expr)) return Number(expr) === value;
  if (/^\*\/\d+$/.test(expr)) {
    const step = Number(expr.slice(2));
    return step > 0 && value % step === 0;
  }
  const list = expr.split(',');
  return list.some((item) => /^\d+$/.test(item) && Number(item) === value);
}
