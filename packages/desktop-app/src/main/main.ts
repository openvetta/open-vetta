import { join } from "node:path";
import { URL } from "node:url";
import { app, BrowserWindow, ipcMain, Menu, nativeImage, nativeTheme, shell, Tray } from "electron";
import { registerRuntimeIpc } from "./ipc.js";
import { registerFsIpc } from "./ipc-fs.js";
import { registerSchedulerIpc } from "./ipc-scheduler.js";
import { initScheduler } from "./scheduler.js";

const PROTOCOL = "vetta";
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let teardownIpc: (() => void) | undefined;
let teardownFsIpc: (() => void) | undefined;
let teardownSchedulerIpc: (() => void) | undefined;
// If true, close button hides to tray instead of quitting
let hideToTrayOnClose = true;
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
const isWindows = process.platform === "win32";

function buildTrayMenu(): Electron.Menu {
	const isVisible = mainWindow?.isVisible() ?? false;
	return Menu.buildFromTemplate([
		{
			label: isVisible ? "隐藏窗口" : "显示窗口",
			click: () => {
				if (!mainWindow) return;
				if (mainWindow.isVisible()) {
					mainWindow.hide();
				} else {
					mainWindow.show();
					mainWindow.focus();
				}
				// Rebuild menu to update label
				rebuildTrayContextMenu();
			},
		},
		{
			label: hideToTrayOnClose ? "退出" : "隐藏到托盘",
			click: () => {
				// Set isQuitting BEFORE app.quit() so the window close handler lets it pass through
				(app as typeof app & { isQuitting?: boolean }).isQuitting = true;
				if (tray) {
					tray.destroy();
					tray = null;
				}
				app.quit();
			},
		},
	]);
}

function createTray(): void {
	if (tray) return; // Already created

	const iconFilePath = iconPath[process.platform];
	console.log(`[tray] Loading icon from: ${iconFilePath}`);
	const icon = nativeImage.createFromPath(iconFilePath);
	console.log(`[tray] Icon loaded: isEmpty=${icon.isEmpty()}`);
	if (icon.isEmpty()) {
		console.warn("[tray] Icon not found, skipping tray creation");
		return;
	}

	// Windows: resize to 16x16 for proper display in system tray
	const trayIcon = isWindows ? icon.resize({ width: 16, height: 16 }) : icon.resize({ width: 22, height: 22 });

	tray = new Tray(trayIcon);
	console.log("[tray] Created successfully");
	tray.setToolTip("Vetta");
	tray.setContextMenu(buildTrayMenu());

	// Single click: toggle window visibility
	tray.on("click", () => {
		if (!mainWindow) return;
		if (mainWindow.isVisible()) {
			mainWindow.hide();
		} else {
			mainWindow.show();
			mainWindow.focus();
		}
		rebuildTrayContextMenu();
	});
}

function rebuildTrayContextMenu(): void {
	if (!tray) return;
	tray.setContextMenu(buildTrayMenu());
}

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
		if (teardownSchedulerIpc) {
			teardownSchedulerIpc();
			teardownSchedulerIpc = undefined;
		}
	});

	// On Windows/Linux: close button hides to tray (if enabled), not quit
	mainWindow.on("close", (event) => {
		console.log(`[close] isMac=${isMac}, hideToTrayOnClose=${hideToTrayOnClose}, tray=${!!tray}`);
		if (!isMac && hideToTrayOnClose && tray) {
			const appAny = app as typeof app & { isQuitting?: boolean };
			if (!appAny.isQuitting) {
				console.log("[close] Hiding to tray instead of closing");
				event.preventDefault();
				mainWindow?.hide();
				rebuildTrayContextMenu();
				return;
			}
			console.log("[close] isQuitting=true, allowing close");
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

	ipcMain.handle("vetta:tray:set-quit-behavior", (_event, hideToTray: boolean) => {
		hideToTrayOnClose = hideToTray;
		rebuildTrayContextMenu();
	});

	ipcMain.handle("vetta:tray:get-quit-behavior", () => {
		return hideToTrayOnClose;
	});

	ipcMain.handle("vetta:tray:set-tooltip", (_event, tooltip: string) => {
		tray?.setToolTip(tooltip);
	});

	ipcMain.handle("vetta:auth:open-external", async (_event, url: string) => {
		await shell.openExternal(url);
	});

	if (process.platform === "darwin") {
		app.dock.setIcon(nativeImage.createFromPath(join(buildDir, "icon-dock.png")));
	}

	createWindow();

	// Create tray icon on Windows and Linux
	if (!isMac) {
		createTray();
	}

	// 先清理可能存在的旧的 scheduler IPC
	if (teardownSchedulerIpc) {
		teardownSchedulerIpc();
		teardownSchedulerIpc = undefined;
	}

	void initScheduler().then(() => {
		if (mainWindow) {
			teardownSchedulerIpc = registerSchedulerIpc(mainWindow.webContents);
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
