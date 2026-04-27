import { join } from "node:path";
import { URL } from "node:url";
import { app, BrowserWindow, ipcMain, nativeImage, nativeTheme, shell } from "electron";
import { getImHost } from "./im-host/index.js";
import {
	type IpcTeardown,
	registerAllIpc,
	registerBatchTasksIpc,
	registerSchedulerIpc,
	teardownAllIpc,
} from "./ipc/index.js";
import { disposeSharedRuntime } from "./runtime.js";
import { initializeLinuxSandboxCapability } from "./sandbox/capability.js";
import { initScheduler } from "./scheduler/scheduler.js";
import {
	createTray,
	getHideToTrayOnClose,
	getTray,
	rebuildTrayContextMenu,
	setHideToTrayOnClose,
} from "./tray-manager.js";
import { getAppVersion } from "./updater.js";
import { createWindow, getMainWindow, setMainWindow } from "./window-manager.js";

const PROTOCOL = "vetta";
const isMac = process.platform === "darwin";
const appRoot = app.isPackaged ? app.getAppPath() : process.cwd();
const buildDir = join(appRoot, "build");

// 开发模式下 app.name/version 默认来自 Electron 框架，需要手动覆盖
if (!app.isPackaged) {
	app.name = "Vetta";
}

let ipcTeardown: IpcTeardown | undefined;
let teardownSchedulerIpc: (() => void) | undefined;
let teardownBatchTasksIpc: (() => void) | undefined;

// Register custom protocol for OAuth callback
// Windows dev mode: must pass electron.exe path and app entry as args,
// otherwise the URL gets interpreted as a module path.
if (!app.isPackaged && process.platform === "win32") {
	app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [join(appRoot, "dist/main/index.js")]);
} else {
	app.setAsDefaultProtocolClient(PROTOCOL);
}

function handleProtocolUrl(rawUrl: string): void {
	try {
		const parsed = new URL(rawUrl);
		if (parsed.hostname === "oauth" && parsed.pathname.startsWith("/callback")) {
			const token = parsed.searchParams.get("token");
			const mainWindow = getMainWindow();
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
	const mainWindow = getMainWindow();
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
		const protocolUrl = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
		if (protocolUrl) {
			handleProtocolUrl(protocolUrl);
		}
		const mainWindow = getMainWindow();
		if (mainWindow) {
			if (mainWindow.isMinimized()) mainWindow.restore();
			mainWindow.focus();
		}
	});
}

app.whenReady().then(async () => {
	if (process.platform === "linux") {
		const capability = await initializeLinuxSandboxCapability();
		console.log("[linux-sandbox] startup probe", capability);
	}

	// 开发模式下覆盖 About 面板信息，避免显示 Electron 框架版本
	if (!app.isPackaged) {
		const appVersion = getAppVersion();
		app.setAboutPanelOptions({
			applicationName: "Vetta",
			applicationVersion: appVersion,
			version: "",
		});
	}

	// Theme IPC
	ipcMain.handle("vetta:theme:set", (_event, mode: string) => {
		nativeTheme.themeSource = mode as "system" | "light" | "dark";
		const mainWindow = getMainWindow();
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

	nativeTheme.on("updated", () => {
		const mainWindow = getMainWindow();
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

	ipcMain.handle("vetta:shell:show-item-in-folder", (_event, fullPath: string) => {
		shell.showItemInFolder(fullPath);
	});

	ipcMain.handle("vetta:window:minimize", () => {
		getMainWindow()?.minimize();
	});

	ipcMain.handle("vetta:window:maximize", () => {
		const mainWindow = getMainWindow();
		if (mainWindow?.isMaximized()) {
			mainWindow.unmaximize();
		} else {
			mainWindow?.maximize();
		}
	});

	ipcMain.handle("vetta:window:close", () => {
		getMainWindow()?.close();
	});

	ipcMain.handle("vetta:window:is-maximized", () => {
		return getMainWindow()?.isMaximized() ?? false;
	});

	ipcMain.handle("vetta:tray:set-quit-behavior", (_event, hideToTray: boolean) => {
		setHideToTrayOnClose(hideToTray);
	});

	ipcMain.handle("vetta:tray:get-quit-behavior", () => {
		return getHideToTrayOnClose();
	});

	ipcMain.handle("vetta:tray:set-tooltip", (_event, tooltip: string) => {
		getTray()?.setToolTip(tooltip);
	});

	ipcMain.handle("vetta:auth:open-external", async (_event, url: string) => {
		await shell.openExternal(url);
	});

	if (process.platform === "darwin") {
		app.dock.setIcon(nativeImage.createFromPath(join(buildDir, "icon-dock.png")));
	}

	const mainWindow = createWindow();

	// Register IPC handlers
	ipcTeardown = registerAllIpc(mainWindow.webContents);

	// On Windows/Linux: close button hides to tray
	mainWindow.on("close", (event) => {
		if (!isMac && getHideToTrayOnClose() && getTray()) {
			const appAny = app as typeof app & { isQuitting?: boolean };
			if (!appAny.isQuitting) {
				event.preventDefault();
				getMainWindow()?.hide();
				rebuildTrayContextMenu();
				return;
			}
		}
	});

	mainWindow.on("closed", () => {
		setMainWindow(null);
		if (ipcTeardown) {
			teardownAllIpc(ipcTeardown);
			ipcTeardown = undefined;
		}
		if (teardownSchedulerIpc) {
			teardownSchedulerIpc();
			teardownSchedulerIpc = undefined;
		}
		if (teardownBatchTasksIpc) {
			teardownBatchTasksIpc();
			teardownBatchTasksIpc = undefined;
		}
	});

	// Create tray icon on Windows and Linux
	if (!isMac) {
		createTray();
	}

	// Initialize scheduler
	if (teardownSchedulerIpc) {
		teardownSchedulerIpc();
		teardownSchedulerIpc = undefined;
	}

	void initScheduler().then(() => {
		const win = getMainWindow();
		if (win) {
			teardownSchedulerIpc = registerSchedulerIpc(win.webContents);
		}
	});

	teardownBatchTasksIpc = registerBatchTasksIpc(mainWindow.webContents);

	// Bootstrap IM bridge subsystem (im-gateway sidecar). Errors during
	// bootstrap are non-fatal — IM is an opt-in feature and the rest of
	// the desktop-app must keep working.
	void getImHost()
		.bootstrap()
		.catch((err: unknown) => {
			console.error("[im-host] bootstrap failed", err);
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

// Critical: ensure IM sidecar is killed before the main process exits.
// `before-quit` runs before window destruction, giving us a synchronous
// hook to wait on graceful child shutdown.
// 标记：避免 before-quit 在调用 app.exit() 后再次触发本 handler 时
// 又陷进异步清理流程。
let quitCleanupStarted = false;

app.on("before-quit", async (event) => {
	if (quitCleanupStarted) return;
	quitCleanupStarted = true;
	event.preventDefault();

	const host = getImHost();
	if (host.getStatus().sidecarPid) {
		try {
			await host.shutdownForQuit();
		} catch (err) {
			console.error("[im-host] shutdown failed", err);
		}
	}
	// 退出前统一释放共享 RuntimeHost 持有的所有 session 文件锁，
	// 避免 .lock 残留，下次启动还要靠 stale-detection 才能回收。
	try {
		await disposeSharedRuntime();
	} catch (err) {
		console.error("[runtime] disposeSharedRuntime failed", err);
	}
	app.exit(0);
});
