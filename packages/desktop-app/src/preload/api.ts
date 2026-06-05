import type { DesktopAuthApi } from "./api-types/auth.js";
import type { DesktopBatchTasksApi } from "./api-types/batch-tasks.js";
import type { DesktopConfigApi } from "./api-types/config.js";
import type { DesktopDebugApi } from "./api-types/debug.js";
import type { DesktopDialogApi } from "./api-types/dialog.js";
import type { DesktopDownloadsApi } from "./api-types/downloads.js";
import type { DesktopFlowingApi } from "./api-types/flowing.js";
import type { DesktopImApi } from "./api-types/im.js";
import type { DesktopMcpApi } from "./api-types/mcp.js";
import type { DesktopModelsApi } from "./api-types/models.js";
import type { DesktopNotificationApi } from "./api-types/notification.js";
import type { DesktopProjectApi } from "./api-types/project.js";
import type { DesktopSchedulerApi } from "./api-types/scheduler.js";
import type { DesktopSessionApi } from "./api-types/session.js";
import type { DesktopSkillsApi } from "./api-types/skills.js";
import type {
	DesktopCreditsApi,
	DesktopPermissionsApi,
	DesktopRuntimesApi,
	DesktopSettingsApi,
	DesktopShellApi,
	DesktopSubscriptionApi,
	DesktopTrayApi,
	DesktopWindowApi,
} from "./api-types/system.js";
import type { DesktopThemeApi } from "./api-types/theme.js";
import type { DesktopUpdaterApi } from "./api-types/updater.js";
import type { DesktopWebhookApi } from "./api-types/webhook.js";
import type { DesktopFsApi } from "./fs-types.js";

export type * from "./api-types/auth.js";
export type * from "./api-types/batch-tasks.js";
export type * from "./api-types/config.js";
export type * from "./api-types/debug.js";
export type * from "./api-types/dialog.js";
export type * from "./api-types/downloads.js";
export type * from "./api-types/flowing.js";
export type * from "./api-types/im.js";
export type * from "./api-types/mcp.js";
export type * from "./api-types/models.js";
export type * from "./api-types/notification.js";
export type * from "./api-types/project.js";
export type * from "./api-types/scheduler.js";
export type * from "./api-types/session.js";
export type * from "./api-types/shared.js";
export type * from "./api-types/skills.js";
export type * from "./api-types/system.js";
export type * from "./api-types/theme.js";
export type * from "./api-types/updater.js";
export type * from "./api-types/webhook.js";

export interface DesktopApi {
	session: DesktopSessionApi;
	dialog: DesktopDialogApi;
	theme: DesktopThemeApi;
	fs: DesktopFsApi;
	skills: DesktopSkillsApi;
	config: DesktopConfigApi;
	models: DesktopModelsApi;
	mcp: DesktopMcpApi;
	settings: DesktopSettingsApi;
	credits: DesktopCreditsApi;
	subscription: DesktopSubscriptionApi;
	shell: DesktopShellApi;
	window: DesktopWindowApi;
	auth: DesktopAuthApi;
	updater: DesktopUpdaterApi;
	tray: DesktopTrayApi;
	scheduler: DesktopSchedulerApi;
	flowing: DesktopFlowingApi;
	batchTasks: DesktopBatchTasksApi;
	downloads: DesktopDownloadsApi;
	im: DesktopImApi;
	debug: DesktopDebugApi;
	project: DesktopProjectApi;
	webhook: DesktopWebhookApi;
	runtimes: DesktopRuntimesApi;
	permissions: DesktopPermissionsApi;
	notification: DesktopNotificationApi;
}

declare global {
	interface Window {
		vetta: DesktopApi;
	}
}
