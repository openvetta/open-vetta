import { join } from "node:path";
import { app, BrowserWindow, nativeTheme } from "electron";
import { setAppMonitorWindowVisible } from "./app-monitor/app-monitor-service.js";
import { getAppLogger } from "./logger.js";
import { openExternalUrl } from "./open-external.js";

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

// macOS 状态栏图标：直接用彩色 PNG logo（icon.icns 在 Tray 上表现不佳）。
// 不作为 template，故不跟随菜单栏深/浅色反相，但保留品牌色。
export const macTrayIconPath = join(buildDir, "icon.png");

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
	return mainWindow;
}

export function setMainWindow(win: BrowserWindow | null): void {
	mainWindow = win;
}

export function createWindow(): BrowserWindow {
	const windowLog = getAppLogger("window");
	const rendererLog = getAppLogger("renderer", "render");
	const preloadPath = join(resDir, "preload/index.js");
	const rendererPath = join(resDir, "renderer/index.html");
	windowLog.info("create", {
		devServerUrl,
		iconPath: iconPath[process.platform],
		preloadPath,
		rendererPath,
	});

	mainWindow = new BrowserWindow({
		width: 1280,
		height: 800,
		// 最小尺寸：低于此值会过度收缩导致布局不可用。窄屏响应式在此宽度下仍生效。
		minWidth: 380,
		minHeight: 600,
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
	setAppMonitorWindowVisible(mainWindow.isVisible());

	mainWindow.on("ready-to-show", () => {
		windowLog.info("ready-to-show");
	});
	mainWindow.on("show", () => {
		windowLog.info("show");
		setAppMonitorWindowVisible(true);
	});
	mainWindow.on("hide", () => {
		windowLog.info("hide");
		setAppMonitorWindowVisible(false);
	});
	mainWindow.on("close", () => {
		windowLog.info("close");
	});
	mainWindow.on("closed", () => {
		windowLog.info("closed");
		setAppMonitorWindowVisible(false);
	});
	mainWindow.webContents.on("did-finish-load", () => {
		windowLog.info("did-finish-load", mainWindow?.webContents.getURL());
	});
	mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
		windowLog.error("did-fail-load", {
			errorCode,
			errorDescription,
			validatedURL,
			isMainFrame,
		});
	});
	mainWindow.webContents.on("preload-error", (_event, preloadPathForError, error) => {
		windowLog.error("preload-error", { preloadPath: preloadPathForError, error });
	});
	mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
		const levelLabel = (["log", "info", "warn", "error"] as const)[level] ?? "log";
		rendererLog[levelLabel](`[${sourceId}:${line}] ${message}`);
	});
	mainWindow.webContents.on("unresponsive", () => {
		windowLog.error("unresponsive");
	});
	mainWindow.webContents.on("responsive", () => {
		windowLog.info("responsive");
	});
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		void openExternalUrl(url).catch((error: unknown) => {
			windowLog.error("open external failed", { url, error });
		});
		return { action: "deny" };
	});

	const loadPromise = devServerUrl ? mainWindow.loadURL(devServerUrl) : mainWindow.loadFile(rendererPath);
	void loadPromise
		.then(() => {
			if (app.isPackaged || !mainWindow || mainWindow.isDestroyed()) return;
			mainWindow.webContents.openDevTools({ mode: "detach", activate: true });
			windowLog.info("open-devtools", { opened: mainWindow.webContents.isDevToolsOpened() });
		})
		.catch((error: unknown) => {
			windowLog.error(devServerUrl ? "loadURL failed" : "loadFile failed", error);
		});

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
