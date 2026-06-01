import type { WebContents } from "electron";
import { registerDebugIpc } from "./debug.js";
import { registerDialogIpc } from "./dialog.js";
import { registerDownloadsIpc } from "./downloads.js";
import { registerFlowingIpc } from "./flowing.js";
import { registerFsIpc } from "./fs.js";
import { registerImIpc } from "./im.js";
import { registerPermissionsIpc } from "./permissions.js";
import { registerProjectExportIpc } from "./project-export.js";
import { registerRuntimesIpc } from "./runtimes.js";
import { registerSessionIpc } from "./session.js";
import { registerSettingsIpc } from "./settings.js";
import { registerSkillsIpc } from "./skills.js";
import { registerUpdaterIpc } from "./updater.js";
import { registerWebhookIpc } from "./webhook.js";

interface IpcTeardown {
	teardownSession: () => void;
	teardownSettings: () => void;
	teardownUpdater: () => void;
	teardownSkills: () => void;
	teardownDialog: () => void;
	teardownFs: () => void;
	teardownFlowing: () => void;
	teardownBatchTasks: () => void;
	teardownDownloads: () => void;
	teardownIm: () => void;
	teardownDebug: () => void;
	teardownProjectExport: () => void;
	teardownWebhook: () => void;
	teardownRuntimes: () => void;
	teardownPermissions: () => void;
}

export function registerAllIpc(webContents: WebContents): IpcTeardown {
	return {
		teardownSession: registerSessionIpc(webContents),
		teardownSettings: registerSettingsIpc(),
		teardownUpdater: registerUpdaterIpc(),
		teardownSkills: registerSkillsIpc(),
		teardownDialog: registerDialogIpc(),
		teardownFs: registerFsIpc(),
		teardownFlowing: registerFlowingIpc(),
		teardownBatchTasks: () => {},
		teardownDownloads: registerDownloadsIpc(webContents),
		teardownIm: registerImIpc(webContents),
		teardownDebug: registerDebugIpc(),
		teardownProjectExport: registerProjectExportIpc(),
		teardownWebhook: registerWebhookIpc(),
		teardownRuntimes: registerRuntimesIpc(),
		teardownPermissions: registerPermissionsIpc(),
	};
}

export function teardownAllIpc(teardown: IpcTeardown): void {
	teardown.teardownSession();
	teardown.teardownSettings();
	teardown.teardownUpdater();
	teardown.teardownSkills();
	teardown.teardownDialog();
	teardown.teardownFs();
	teardown.teardownFlowing();
	teardown.teardownBatchTasks();
	teardown.teardownDownloads();
	teardown.teardownIm();
	teardown.teardownDebug();
	teardown.teardownProjectExport();
	teardown.teardownWebhook();
	teardown.teardownRuntimes();
	teardown.teardownPermissions();
}

export { registerBatchTasksIpc } from "./batch-tasks.js";
export { registerSchedulerIpc } from "./scheduler.js";

export type { IpcTeardown };
