import { ipcMain, shell } from "electron";
import { checkForUpdate, getAppVersion } from "../updater.js";

export function registerUpdaterIpc(): () => void {
	ipcMain.handle("vetta:updater:check", async () => {
		return checkForUpdate();
	});

	ipcMain.handle("vetta:updater:get-current-version", () => {
		return getAppVersion();
	});

	ipcMain.handle("vetta:updater:download", async (_event, url: unknown) => {
		if (typeof url !== "string") throw new Error("Invalid URL");
		await shell.openExternal(url);
	});

	return () => {
		ipcMain.removeHandler("vetta:updater:check");
		ipcMain.removeHandler("vetta:updater:get-current-version");
		ipcMain.removeHandler("vetta:updater:download");
	};
}
