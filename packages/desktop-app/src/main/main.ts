import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain, nativeTheme } from "electron";
import { registerRuntimeIpc } from "./ipc.js";

let mainWindow: BrowserWindow | null = null;
let teardownIpc: (() => void) | undefined;
const currentDir = fileURLToPath(new URL(".", import.meta.url));
const devServerUrl = process.env.VETTA_DESKTOP_DEV_URL;

function createWindow(): void {
	mainWindow = new BrowserWindow({
		width: 1280,
		height: 800,
		titleBarStyle: "hiddenInset",
		trafficLightPosition: { x: 16, y: 20 },
		transparent: true,
		vibrancy: "sidebar",
		visualEffectState: "active",
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			preload: join(currentDir, "../../dist/preload/index.js"),
		},
	});

	teardownIpc = registerRuntimeIpc(mainWindow.webContents);
	if (devServerUrl) {
		void mainWindow.loadURL(devServerUrl);
	} else {
		void mainWindow.loadFile(join(process.cwd(), "dist/renderer/index.html"));
	}
	mainWindow.webContents.openDevTools({ mode: "detach" });
	mainWindow.on("closed", () => {
		mainWindow = null;
		if (teardownIpc) {
			teardownIpc();
			teardownIpc = undefined;
		}
	});
}

app.whenReady().then(() => {
	// Theme IPC: set native theme source and update vibrancy accordingly
	ipcMain.handle("vetta:theme:set", (_event, mode: string) => {
		nativeTheme.themeSource = mode as "system" | "light" | "dark";
		if (mainWindow) {
			const isDark = mode === "dark" || (mode === "system" && nativeTheme.shouldUseDarkColors);
			mainWindow.setVibrancy(isDark ? "sidebar" : "sidebar");
		}
	});

	ipcMain.handle("vetta:theme:get-native", () => {
		return {
			source: nativeTheme.themeSource,
			shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
		};
	});

	// Notify renderer when system theme changes
	nativeTheme.on("updated", () => {
		if (mainWindow) {
			mainWindow.webContents.send("vetta:theme:native-changed", {
				shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
			});
		}
	});

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
