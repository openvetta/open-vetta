import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { DesktopApi } from "./api.js";
import { createBatchTasksApi } from "./apis/batch-tasks.js";
import { createDownloadsApi } from "./apis/downloads.js";
import { createImApi } from "./apis/im.js";
import { createNotificationApi } from "./apis/notification.js";
import { createSchedulerApi } from "./apis/scheduler.js";
import { createSessionApi } from "./apis/session.js";
import { createSystemApi } from "./apis/system.js";
import { createWebhookApi } from "./apis/webhook.js";

const api: DesktopApi = {
	...createSessionApi(ipcRenderer),
	...createImApi(ipcRenderer),
	...createDownloadsApi(ipcRenderer),
	...createBatchTasksApi(ipcRenderer),
	...createSchedulerApi(ipcRenderer),
	...createWebhookApi(ipcRenderer),
	...createNotificationApi(ipcRenderer),
	...createSystemApi(ipcRenderer, webUtils),
};

contextBridge.exposeInMainWorld("vetta", api);
