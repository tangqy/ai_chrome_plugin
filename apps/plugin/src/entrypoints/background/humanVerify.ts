import { RuntimeMessageTypes, extractHumanVerifyTaskFromBridgeMessage, type HumanVerifyTask } from '../shared/validation';

type SidePanelApi = {
  open: (args: { tabId: number }) => Promise<void> | void;
  setOptions: (args: { tabId: number; path?: string; enabled?: boolean }) => Promise<void> | void;
};

let currentTask: HumanVerifyTask | null = null;

function getSidePanelApi(): SidePanelApi | null {
  const api = (chrome as unknown as { sidePanel?: Partial<SidePanelApi> }).sidePanel;
  if (!api?.open || !api?.setOptions) return null;
  return api as SidePanelApi;
}

async function openSidePanelForActiveTab() {
  const api = getSidePanelApi();
  if (!api) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  await Promise.resolve(api.setOptions({ tabId: tab.id, enabled: true, path: 'sidepanel.html' }));
  await Promise.resolve(api.open({ tabId: tab.id }));
}

function pushToSidePanel(task: HumanVerifyTask | null) {
  console.log('[humanVerify] pushing task to side panel:', task);
  void chrome.runtime.sendMessage({ type: RuntimeMessageTypes.humanVerifyPromptPush, payload: task }).catch((err) => {
    console.error('[humanVerify] push to side panel failed:', err);
  });
}

export function setHumanVerifyTask(task: HumanVerifyTask | null) {
  currentTask = task;
  pushToSidePanel(task);
  if (task) void openSidePanelForActiveTab().catch(() => {});
}

export function getHumanVerifyTask() {
  return currentTask;
}

export function handleBridgeHumanVerifyMessage(message: unknown) {
  console.log('[humanVerify] received bridge message:', message);
  const task = extractHumanVerifyTaskFromBridgeMessage(message);
  console.log('[humanVerify] extracted task:', task);
  if (!task) return false;
  setHumanVerifyTask(task);
  return true;
}

