import type { WebContents } from "electron";
import { registerDialogIpc } from "./dialog.js";
import { registerFlowingIpc } from "./flowing.js";
import { registerFsIpc } from "./fs.js";
import { registerSessionIpc } from "./session.js";
import { registerSettingsIpc } from "./settings.js";
import { registerSkillsIpc } from "./skills.js";
import { registerUpdaterIpc } from "./updater.js";

interface IpcTeardown {
	teardownSession: () => void;
	teardownSettings: () => void;
	teardownUpdater: () => void;
	teardownSkills: () => void;
	teardownDialog: () => void;
	teardownFs: () => void;
	teardownFlowing: () => void;
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
}

export { registerSchedulerIpc } from "./scheduler.js";

export type { IpcTeardown };
