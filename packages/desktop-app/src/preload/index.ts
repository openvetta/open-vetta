import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { DesktopApi } from "./api.js";
import { createActionApprovalApi } from "./apis/action-approval.js";
import { createBatchTasksApi } from "./apis/batch-tasks.js";
import { createDownloadsApi } from "./apis/downloads.js";
import { createI18nApi } from "./apis/i18n.js";
import { createImApi } from "./apis/im.js";
import { createNotificationApi } from "./apis/notification.js";
import { createPetApi } from "./apis/pet.js";
import { createPluginsApi } from "./apis/plugins.js";
import { createSchedulerApi } from "./apis/scheduler.js";
import { createSessionApi } from "./apis/session.js";
import { createSystemApi } from "./apis/system.js";
import { createWebhookApi } from "./apis/webhook.js";

const USER_ACTIVITY_CHANNEL = "vetta:app-monitor:user-activity";
const USER_ACTIVITY_THROTTLE_MS = 15_000;
let lastUserActivitySentAt = 0;

const reportUserActivity = (): void => {
	const now = Date.now();
	if (now - lastUserActivitySentAt < USER_ACTIVITY_THROTTLE_MS) return;
	lastUserActivitySentAt = now;
	ipcRenderer.send(USER_ACTIVITY_CHANNEL);
};

for (const eventName of ["keydown", "mousedown", "mousemove", "touchstart", "wheel"] as const) {
	window.addEventListener(eventName, reportUserActivity, { capture: true, passive: true });
}

const api: DesktopApi = {
	...createActionApprovalApi(ipcRenderer),
	...createSessionApi(ipcRenderer),
	...createImApi(ipcRenderer),
	...createDownloadsApi(ipcRenderer),
	...createBatchTasksApi(ipcRenderer),
	...createSchedulerApi(ipcRenderer),
	...createWebhookApi(ipcRenderer),
	...createNotificationApi(ipcRenderer),
	...createPluginsApi(ipcRenderer),
	...createPetApi(ipcRenderer),
	...createI18nApi(ipcRenderer),
	...createSystemApi(ipcRenderer, webUtils),
};

contextBridge.exposeInMainWorld("vetta", api);
