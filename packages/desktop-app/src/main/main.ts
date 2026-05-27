import { mkdir } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { URL } from "node:url";
import { app, ipcMain, nativeImage, nativeTheme, shell } from "electron";
import { parseAgentRpcCommand, runAgentRpcCommand } from "./cli/agent-rpc-command.js";
import { parseOcrCliCommand, runOcrCliCommand } from "./cli/ocr-command.js";
import { parsePdfCliCommand, runPdfCliCommand } from "./cli/pdf-command.js";

import { ensureDevCliShim } from "./dev-cli-shim.js";
import {
	getDiagnosticsLogPath,
	installChromiumFetchForMain,
	installMainDiagnostics,
	registerLocalNetworkAccess,
} from "./diagnostics.js";
import { getImHost } from "./im-host/index.js";
import { persistVettaAppPath } from "./ipc/fs.js";
import {
	type IpcTeardown,
	registerAllIpc,
	registerBatchTasksIpc,
	registerSchedulerIpc,
	teardownAllIpc,
} from "./ipc/index.js";
import { getAppLogger } from "./logger.js";
import { disposeSharedRuntime } from "./runtime.js";
import { initializeSandboxCapability } from "./sandbox/capability.js";
import { initScheduler } from "./scheduler/scheduler.js";
import {
	createTray,
	getHideToTrayOnClose,
	getTray,
	rebuildTrayContextMenu,
	setHideToTrayOnClose,
} from "./tray-manager.js";
import { getAppVersion, updaterService } from "./updater.js";
import { createWindow, getMainWindow, setMainWindow, showMainWindow } from "./window-manager.js";

const PROTOCOL = "vetta";
const isMac = process.platform === "darwin";
const appRoot = app.isPackaged ? app.getAppPath() : process.cwd();
const buildDir = join(appRoot, "build");
const devMainEntryPath = join(appRoot, "dist/main/index.js");
// OCR is checked first so that `ocr --help` (and other ocr-scoped flags) is
// not swallowed by the older pdf CLI parser, which eagerly matches `-h` /
// `--help`. Either CLI uses keywords distinct enough that order is otherwise
// inconsequential.
const ocrCliCommand = parseOcrCliCommand(process.argv);
const pdfCliCommand = ocrCliCommand === null ? parsePdfCliCommand(process.argv) : null;
// `--agent-rpc` is the IM sidecar's discriminator: when present we
// short-circuit into @vetta/coding-agent's main and skip every UI/IPC
// bring-up below. See cli/agent-rpc-command.ts for the full rationale.
const agentRpcArgs = pdfCliCommand === null && ocrCliCommand === null ? parseAgentRpcCommand(process.argv) : null;
const isCliMode = pdfCliCommand !== null || ocrCliCommand !== null || agentRpcArgs !== null;

// 给 V8 老生代一个明确上限：超过会抛 `RangeError: Invalid string length` /
// JS heap out of memory，能被 uncaughtException 接到并落盘栈；否则任 RSS 自然
// 膨胀，最终被 Linux OOM Killer SIGKILL，进程静默消失、连一行日志都来不及写。
// 4096MB 是当前桌面端图片/PDF/批量任务工作集的经验上限，未来如果常驻数据更大
// 再上调；CLI 模式跑短任务，沿用默认值即可。
if (!isCliMode) {
	app.commandLine.appendSwitch("js-flags", "--max-old-space-size=4096");
}

installMainDiagnostics();
const mainLog = getAppLogger("main");

if (isCliMode) {
	const cliUserDataDir =
		ocrCliCommand !== null
			? "vetta-ocr-cli"
			: pdfCliCommand !== null
				? "vetta-pdf-cli"
				: `vetta-agent-rpc-${process.pid}`;
	app.setPath("userData", join(tmpdir(), cliUserDataDir));
	app.commandLine.appendSwitch("disable-gpu");
	app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
	app.commandLine.appendSwitch("disk-cache-size", "0");
	// CLI mode is agent-driven: keep stderr clean of Electron's dev-time
	// security advisories so callers can rely on stderr being structured
	// NDJSON progress + errors only.
	process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";
}

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
if (!isCliMode) {
	if (!app.isPackaged && process.platform === "win32") {
		app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [devMainEntryPath]);
	} else {
		app.setAsDefaultProtocolClient(PROTOCOL);
	}
}

function handleProtocolUrl(rawUrl: string): void {
	try {
		const parsed = new URL(rawUrl);
		if (parsed.hostname === "oauth" && parsed.pathname.startsWith("/callback")) {
			const token = parsed.searchParams.get("token");
			const refreshToken = parsed.searchParams.get("refresh_token");
			const mainWindow = getMainWindow();
			if (token && mainWindow) {
				mainWindow.webContents.send("vetta:auth:oauth-callback", {
					token,
					refreshToken: refreshToken ?? undefined,
				});
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
const gotSingleLock = isCliMode ? true : app.requestSingleInstanceLock();
if (!gotSingleLock) {
	app.exit(0);
} else {
	app.on("second-instance", (_event, argv) => {
		const protocolUrl = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
		if (protocolUrl) {
			handleProtocolUrl(protocolUrl);
		}
		showMainWindow();
	});
	app.whenReady().then(async () => {
		if (pdfCliCommand) {
			const exitCode = await runPdfCliCommand(pdfCliCommand);
			// `app.quit()` does not honour `process.exitCode` reliably on macOS —
			// the graceful-quit flow can race with stdio flush and end up reporting
			// 0. Use `app.exit()` for headless one-shot CLI invocations.
			app.exit(exitCode);
			return;
		}

		if (ocrCliCommand) {
			const exitCode = await runOcrCliCommand(ocrCliCommand);
			app.exit(exitCode);
			return;
		}

		if (agentRpcArgs) {
			const exitCode = await runAgentRpcCommand(agentRpcArgs);
			app.exit(exitCode);
			return;
		}

		mainLog.info("diagnostics log", getDiagnosticsLogPath());
		mainLog.info("ready", {
			isPackaged: app.isPackaged,
			appPath: app.getAppPath(),
			resourcesPath: process.resourcesPath,
			execPath: process.execPath,
			argv: process.argv,
		});

		// 必须放在 whenReady 之后：早于 ready 调用时主进程 bundle identity
		// 尚未在 launchd/TCC 子系统注册，syscall 关联不到 com.vetta.desktop，
		// 探针白发。
		registerLocalNetworkAccess();

		// 走 Chromium 网络栈替代 Node undici，绕过 macOS 15 LNP 对裸 socket 的拦截。
		// 必须在 ready 之后调用（net.fetch 依赖 session）。
		installChromiumFetchForMain();

		if (process.platform === "linux" || process.platform === "darwin" || process.platform === "win32") {
			const capability = await initializeSandboxCapability();
			mainLog.info("sandbox startup probe", capability);
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

		// 默认「对话」项目目录：保证一直存在。
		// 顺带把 in-tree session 目录（<cwd>/.vetta/sessions）也建好，
		// 让默认项目走与批量项目一致的会话布局，避免设备相关的编码路径。
		try {
			await mkdir(join(homedir(), ".vetta", "conversation", ".vetta", "sessions"), { recursive: true });
		} catch (err) {
			mainLog.error("failed to ensure default conversation dir", err);
		}

		try {
			if (app.isPackaged) {
				await persistVettaAppPath(process.execPath);
			} else {
				const devCliShimPath = await ensureDevCliShim({
					appRoot,
					electronPath: process.execPath,
					mainEntryPath: devMainEntryPath,
				});
				await persistVettaAppPath(devCliShimPath);
			}
		} catch (err) {
			mainLog.error("failed to persist vettaAppPath", err);
		}

		const mainWindow = createWindow();

		// Register IPC handlers
		ipcTeardown = registerAllIpc(mainWindow.webContents);

		// 启动 Updater：恢复 pending-install + 后台检查一次
		updaterService.setMainWindow(mainWindow);
		void updaterService.onAppReady();

		// On macOS: close button hides window (follows macOS platform convention)
		// On Windows/Linux: close button hides to tray
		mainWindow.on("close", (event) => {
			if (isMac) {
				const appAny = app as typeof app & { isQuitting?: boolean };
				if (!appAny.isQuitting) {
					event.preventDefault();
					getMainWindow()?.hide();
					return;
				}
			} else if (getHideToTrayOnClose() && getTray()) {
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

		// 创建托盘/状态栏图标（三平台均启用；行为差异见 tray-manager.ts）
		createTray();

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
				mainLog.error("im-host bootstrap failed", err);
			});

		app.on("activate", () => {
			showMainWindow();
		});
	});
}

app.on("window-all-closed", () => {
	if (isCliMode) return;
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
	if (isCliMode) return;
	if (quitCleanupStarted) return;
	quitCleanupStarted = true;
	(app as typeof app & { isQuitting?: boolean }).isQuitting = true;
	event.preventDefault();

	const host = getImHost();
	if (host.getStatus().sidecarPid) {
		try {
			await host.shutdownForQuit();
		} catch (err) {
			mainLog.error("im-host shutdown failed", err);
		}
	}
	// 退出前统一释放共享 RuntimeHost 持有的所有 session 文件锁，
	// 避免 .lock 残留，下次启动还要靠 stale-detection 才能回收。
	try {
		await disposeSharedRuntime();
	} catch (err) {
		mainLog.error("disposeSharedRuntime failed", err);
	}
	app.exit(0);
});
