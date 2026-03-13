import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";
import { registerRuntimeIpc } from "./ipc.js";

let mainWindow: BrowserWindow | null = null;
let teardownIpc: (() => void) | undefined;
const currentDir = fileURLToPath(new URL(".", import.meta.url));

function createWindow(): void {
	mainWindow = new BrowserWindow({
		width: 1280,
		height: 800,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			preload: join(currentDir, "../preload/index.js"),
		},
	});

	teardownIpc = registerRuntimeIpc(mainWindow.webContents);
	mainWindow.loadFile(join(currentDir, "../renderer/index.html"));
	mainWindow.on("closed", () => {
		mainWindow = null;
		if (teardownIpc) {
			teardownIpc();
			teardownIpc = undefined;
		}
	});
}

app.whenReady().then(() => {
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});
