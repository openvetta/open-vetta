import { app, ipcMain } from "electron";
import { readCurrentReleaseNote } from "../current-release-note.js";
import { getAppVersion, updaterService } from "../updater.js";

export function registerUpdaterIpc(): () => void {
	ipcMain.handle("vetta:updater:check", async () => {
		return updaterService.check();
	});

	ipcMain.handle("vetta:updater:sync", async () => {
		await updaterService.syncInBackground();
	});

	ipcMain.handle("vetta:updater:get-state", () => {
		return updaterService.getState();
	});

	ipcMain.handle("vetta:updater:get-current-version", () => {
		return getAppVersion();
	});

	ipcMain.handle("vetta:updater:get-current-release-note", () => {
		return (
			readCurrentReleaseNote({
				version: getAppVersion(),
				isPackaged: app.isPackaged,
				resourcesPath: process.resourcesPath,
				cwd: process.cwd(),
			}) ?? null
		);
	});

	ipcMain.handle("vetta:updater:download", async () => {
		return updaterService.startDownload();
	});

	ipcMain.handle("vetta:updater:install", async () => {
		await updaterService.install();
	});

	ipcMain.handle("vetta:updater:dismiss", () => {
		updaterService.dismissReady();
	});

	ipcMain.handle("vetta:updater:cancel", () => {
		updaterService.cancel();
	});

	return () => {
		ipcMain.removeHandler("vetta:updater:check");
		ipcMain.removeHandler("vetta:updater:sync");
		ipcMain.removeHandler("vetta:updater:get-state");
		ipcMain.removeHandler("vetta:updater:get-current-version");
		ipcMain.removeHandler("vetta:updater:get-current-release-note");
		ipcMain.removeHandler("vetta:updater:download");
		ipcMain.removeHandler("vetta:updater:install");
		ipcMain.removeHandler("vetta:updater:dismiss");
		ipcMain.removeHandler("vetta:updater:cancel");
	};
}
