import { join } from "node:path";
import { app, BrowserWindow, nativeTheme } from "electron";
import { writeDiagnosticLog } from "./diagnostics.js";

const isMac = process.platform === "darwin";
const appRoot = app.isPackaged ? app.getAppPath() : process.cwd();
const resDir = app.isPackaged ? appRoot : join(appRoot, "dist");
const buildDir = app.isPackaged ? join(process.resourcesPath, "build") : join(appRoot, "build");
const devServerUrl = process.env.VETTA_DESKTOP_DEV_URL;

export const iconPath: Record<string, string> = {
	darwin: join(buildDir, "icon.icns"),
	win32: join(buildDir, "icon.ico"),
	linux: join(buildDir, "icon.png"),
};

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
	return mainWindow;
}

export function setMainWindow(win: BrowserWindow | null): void {
	mainWindow = win;
}

export function createWindow(): BrowserWindow {
	const preloadPath = join(resDir, "preload/index.js");
	const rendererPath = join(resDir, "renderer/index.html");
	writeDiagnosticLog("log", "[window] create", {
		devServerUrl,
		iconPath: iconPath[process.platform],
		preloadPath,
		rendererPath,
	});

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
			preload: preloadPath,
		},
	});

	mainWindow.on("ready-to-show", () => {
		console.log("[window] ready-to-show");
	});
	mainWindow.on("show", () => {
		console.log("[window] show");
	});
	mainWindow.on("hide", () => {
		console.log("[window] hide");
	});
	mainWindow.on("close", () => {
		console.log("[window] close");
	});
	mainWindow.on("closed", () => {
		console.log("[window] closed");
	});
	mainWindow.webContents.on("did-finish-load", () => {
		console.log("[window] did-finish-load", mainWindow?.webContents.getURL());
	});
	mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
		console.error("[window] did-fail-load", {
			errorCode,
			errorDescription,
			validatedURL,
			isMainFrame,
		});
	});
	mainWindow.webContents.on("preload-error", (_event, preloadPathForError, error) => {
		console.error("[window] preload-error", { preloadPath: preloadPathForError, error });
	});
	mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
		writeDiagnosticLog("log", "[renderer] console-message", { level, message, line, sourceId });
	});
	mainWindow.webContents.on("unresponsive", () => {
		console.error("[window] unresponsive");
	});
	mainWindow.webContents.on("responsive", () => {
		console.log("[window] responsive");
	});

	if (devServerUrl) {
		void mainWindow.loadURL(devServerUrl).catch((error: unknown) => {
			console.error("[window] loadURL failed", error);
		});
	} else {
		void mainWindow.loadFile(rendererPath).catch((error: unknown) => {
			console.error("[window] loadFile failed", error);
		});
	}
	if (!app.isPackaged) {
		mainWindow.webContents.openDevTools({ mode: "detach" });
	}

	return mainWindow;
}

export function showMainWindow(): BrowserWindow {
	if (!mainWindow || mainWindow.isDestroyed()) {
		return createWindow();
	}

	if (!mainWindow.isVisible()) {
		mainWindow.show();
	}
	if (mainWindow.isMinimized()) {
		mainWindow.restore();
	}
	mainWindow.focus();
	return mainWindow;
}
