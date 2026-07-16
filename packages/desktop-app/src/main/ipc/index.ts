import type { WebContents } from "electron";
import type { ActionApprovalBroker } from "../app-actions/approval-broker.js";
import { registerNotificationIpc } from "../notifications/index.js";
import { registerActionApprovalIpc } from "./action-approval.js";
import { registerAppMonitorIpc } from "./app-monitor.js";
import { registerAppshotIpc } from "./appshot.js";
import { registerDebugIpc } from "./debug.js";
import { registerDiagnosticsIpc } from "./diagnostics.js";
import { registerDialogIpc } from "./dialog.js";
import { registerDownloadsIpc } from "./downloads.js";
import { registerFsIpc } from "./fs.js";
import { registerImIpc } from "./im.js";
import { registerMediaIpc } from "./media.js";
import { registerOnboardingIpc } from "./onboarding.js";
import { registerPermissionsIpc } from "./permissions.js";
import { registerPetIpc } from "./pet.js";
import { registerPluginsIpc } from "./plugins.js";
import { registerProjectExportIpc } from "./project-export.js";
import { registerQuickPanelIpc } from "./quickpanel.js";
import { registerRuntimesIpc } from "./runtimes.js";
import { registerSessionIpc } from "./session.js";
import { registerSettingsIpc } from "./settings.js";
import { registerSkillsIpc } from "./skills.js";
import { registerThemesIpc } from "./themes.js";
import { registerUpdaterIpc } from "./updater.js";
import { registerWebhookIpc } from "./webhook.js";

interface IpcTeardown {
	teardownActionApproval: () => void;
	teardownAppMonitor: () => void;
	teardownSession: () => void;
	teardownSettings: () => void;
	teardownUpdater: () => void;
	teardownSkills: () => void;
	teardownThemes: () => void;
	teardownDialog: () => void;
	teardownFs: () => void;
	teardownBatchTasks: () => void;
	teardownDownloads: () => void;
	teardownIm: () => void;
	teardownMedia: () => void;
	teardownDebug: () => void;
	teardownProjectExport: () => void;
	teardownWebhook: () => void;
	teardownRuntimes: () => void;
	teardownPermissions: () => void;
	teardownPlugins: () => void;
	teardownNotifications: () => void;
	teardownPet: () => void;
	teardownQuickPanel: () => void;
	teardownAppshot: () => void;
	teardownDiagnostics: () => void;
	teardownOnboarding: () => void;
}

export function registerAllIpc(
	webContents: WebContents,
	options: { actionApprovalBroker: ActionApprovalBroker },
): IpcTeardown {
	return {
		teardownActionApproval: registerActionApprovalIpc(options.actionApprovalBroker),
		teardownAppMonitor: registerAppMonitorIpc(),
		teardownSession: registerSessionIpc(webContents),
		teardownSettings: registerSettingsIpc(),
		teardownUpdater: registerUpdaterIpc(),
		teardownSkills: registerSkillsIpc(),
		teardownThemes: registerThemesIpc(),
		teardownDialog: registerDialogIpc(),
		teardownFs: registerFsIpc(),
		teardownBatchTasks: () => {},
		teardownDownloads: registerDownloadsIpc(webContents),
		teardownIm: registerImIpc(webContents),
		teardownMedia: registerMediaIpc(),
		teardownDebug: registerDebugIpc(),
		teardownProjectExport: registerProjectExportIpc(),
		teardownWebhook: registerWebhookIpc(),
		teardownRuntimes: registerRuntimesIpc(),
		teardownPermissions: registerPermissionsIpc(),
		teardownPlugins: registerPluginsIpc(),
		teardownNotifications: registerNotificationIpc(webContents),
		teardownPet: registerPetIpc(),
		teardownQuickPanel: registerQuickPanelIpc(),
		teardownAppshot: registerAppshotIpc(),
		teardownDiagnostics: registerDiagnosticsIpc(),
		teardownOnboarding: registerOnboardingIpc(),
	};
}

export function teardownAllIpc(teardown: IpcTeardown): void {
	teardown.teardownActionApproval();
	teardown.teardownAppMonitor();
	teardown.teardownSession();
	teardown.teardownSettings();
	teardown.teardownUpdater();
	teardown.teardownSkills();
	teardown.teardownThemes();
	teardown.teardownDialog();
	teardown.teardownFs();
	teardown.teardownBatchTasks();
	teardown.teardownDownloads();
	teardown.teardownIm();
	teardown.teardownMedia();
	teardown.teardownDebug();
	teardown.teardownProjectExport();
	teardown.teardownWebhook();
	teardown.teardownRuntimes();
	teardown.teardownPermissions();
	teardown.teardownPlugins();
	teardown.teardownNotifications();
	teardown.teardownPet();
	teardown.teardownQuickPanel();
	teardown.teardownAppshot();
	teardown.teardownDiagnostics();
	teardown.teardownOnboarding();
}

export { registerBatchTasksIpc } from "./batch-tasks.js";
export { registerSchedulerIpc } from "./scheduler.js";

export type { IpcTeardown };
