import { join } from "node:path";
import { URL } from "node:url";
import { app, BrowserWindow, ipcMain, nativeImage, nativeTheme, shell } from "electron";
import { registerRuntimeIpc } from "./ipc.js";
import { registerFsIpc } from "./ipc-fs.js";
import { registerSchedulerIpc } from "./ipc-scheduler.js";
import { initScheduler } from "./scheduler.js";

const PROTOCOL = "vetta";
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

// Register custom protocol for OAuth callback
app.setAsDefaultProtocolClient(PROTOCOL);

function handleProtocolUrl(rawUrl: string): void {
	// Expected: vetta://oauth/callback?token=xxx
	try {
		const parsed = new URL(rawUrl);
		if (parsed.hostname === "oauth" && parsed.pathname.startsWith("/callback")) {
			const token = parsed.searchParams.get("token");
			if (token && mainWindow) {
				mainWindow.webContents.send("vetta:auth:oauth-callback", { token });
			}
		}
	} catch {
		// Ignore malformed URLs
	}
}

// macOS: app may already be running when protocol URL is opened
app.on("open-url", (event, url) => {
	event.preventDefault();
	handleProtocolUrl(url);
	// Bring window to front
	if (mainWindow) {
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.focus();
	}
});

// Windows/Linux: second instance passes URL via argv
const gotSingleLock = app.requestSingleInstanceLock();
if (!gotSingleLock) {
	app.quit();
} else {
	app.on("second-instance", (_event, argv) => {
		// Protocol URL is the last argv entry on Windows
		const protocolUrl = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
		if (protocolUrl) {
			handleProtocolUrl(protocolUrl);
		}
		if (mainWindow) {
			if (mainWindow.isMinimized()) mainWindow.restore();
			mainWindow.focus();
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

	ipcMain.handle("vetta:auth:open-external", async (_event, url: string) => {
		await shell.openExternal(url);
	});

	if (process.platform === "darwin") {
		app.dock.setIcon(nativeImage.createFromPath(join(buildDir, "icon-dock.png")));
	}

	createWindow();
	void initScheduler().then(() => {
		if (mainWindow) {
			registerSchedulerIpc(mainWindow.webContents);
		}
	});

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
