import { join } from "node:path";
import { app, BrowserWindow, ipcMain, nativeImage, nativeTheme, shell } from "electron";
import { registerRuntimeIpc } from "./ipc.js";
import { registerFsIpc } from "./ipc-fs.js";

let mainWindow: BrowserWindow | null = null;
let teardownIpc: (() => void) | undefined;
let teardownFsIpc: (() => void) | undefined;
const devServerUrl = process.env.VETTA_DESKTOP_DEV_URL;
const appRoot = app.isPackaged ? app.getAppPath() : process.cwd();
const resDir = app.isPackaged ? appRoot : join(appRoot, "dist");
const buildDir = join(appRoot, "build");

const iconPath: Record<string, string> = {
	darwin: join(buildDir, "icon.icns"),
	win32: join(buildDir, "icon.ico"),
	linux: join(buildDir, "icon.png"),
};

const isMac = process.platform === "darwin";

function createWindow(): void {
	mainWindow = new BrowserWindow({
		width: 1280,
		height: 800,
		icon: iconPath[process.platform],
		transparent: isMac,
		frame: isMac,
		titleBarStyle: isMac ? "hiddenInset" : undefined,
		trafficLightPosition: isMac ? { x: 16, y: 20 } : undefined,
		vibrancy: isMac ? "sidebar" : undefined,
		visualEffectState: isMac ? "active" : undefined,
		backgroundColor: isMac ? undefined : nativeTheme.shouldUseDarkColors ? "#161616" : "#f5f5f7",
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			preload: join(resDir, "preload/index.js"),
		},
	});

	teardownIpc = registerRuntimeIpc(mainWindow.webContents);
	teardownFsIpc = registerFsIpc();
	if (devServerUrl) {
		void mainWindow.loadURL(devServerUrl);
	} else {
		void mainWindow.loadFile(join(resDir, "renderer/index.html"));
	}
	if (!app.isPackaged) {
		mainWindow.webContents.openDevTools({ mode: "detach" });
	}
	mainWindow.on("closed", () => {
		mainWindow = null;
		if (teardownIpc) {
			teardownIpc();
			teardownIpc = undefined;
		}
		if (teardownFsIpc) {
			teardownFsIpc();
			teardownFsIpc = undefined;
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
			if (!isMac) {
				mainWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? "#161616" : "#f5f5f7");
			}
			mainWindow.webContents.send("vetta:theme:native-changed", {
				shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
			});
		}
	});

	ipcMain.handle("vetta:shell:show-in-folder", async (_event, fullPath: string) => {
		await shell.openPath(fullPath);
	});

	ipcMain.handle("vetta:window:minimize", () => {
		mainWindow?.minimize();
	});

	ipcMain.handle("vetta:window:maximize", () => {
		if (mainWindow?.isMaximized()) {
			mainWindow.unmaximize();
		} else {
			mainWindow?.maximize();
		}
	});

	ipcMain.handle("vetta:window:close", () => {
		mainWindow?.close();
	});

	ipcMain.handle("vetta:window:is-maximized", () => {
		return mainWindow?.isMaximized() ?? false;
	});

	if (process.platform === "darwin") {
		app.dock.setIcon(nativeImage.createFromPath(join(buildDir, "icon-dock.png")));
	}

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
