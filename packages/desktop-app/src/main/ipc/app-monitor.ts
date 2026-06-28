import { ipcMain } from "electron";
import { recordAppMonitorUserActivity } from "../app-monitor/app-monitor-service.js";

const USER_ACTIVITY_CHANNEL = "vetta:app-monitor:user-activity";

export function registerAppMonitorIpc(): () => void {
	const onUserActivity = (): void => {
		recordAppMonitorUserActivity();
	};
	ipcMain.on(USER_ACTIVITY_CHANNEL, onUserActivity);
	return () => {
		ipcMain.removeListener(USER_ACTIVITY_CHANNEL, onUserActivity);
	};
}
