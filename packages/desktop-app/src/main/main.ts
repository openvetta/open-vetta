import { mkdir } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { URL } from "node:url";
import { getVettaHomePath, VETTA_HOME_ENV } from "@vetta/action-rpc";
import { app, ipcMain, nativeImage, nativeTheme, shell } from "electron";
import { getActionServerEndpointFilePath } from "./app-actions/endpoint-file.js";
import { createAppActionRuntime } from "./app-actions/index.js";
import { type LocalActionServerHandle, startLocalActionServer } from "./app-actions/local-server.js";
import { parseActionCliCommand, runActionCliCommand } from "./cli/action-command.js";
import { parseAgentRpcCommand, runAgentRpcCommand } from "./cli/agent-rpc-command.js";
import { parseHelpCliCommand, runHelpCliCommand } from "./cli/help-command.js";
import { parseOcrCliCommand, runOcrCliCommand } from "./cli/ocr-command.js";
import { parsePdfCliCommand, runPdfCliCommand } from "./cli/pdf-command.js";

import { ensureDevCliShim } from "./dev-cli-shim.js";
import {
	getDiagnosticsLogPath,
	installChromiumFetchForMain,
	installMainDiagnostics,
	registerLocalNetworkAccess,
} from "./diagnostics.js";
import { fixPath } from "./fix-path.js";
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
import { getRuntimeManager } from "./runtimes/manager.js";
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

// 启动早期修复 GUI 进程的 PATH(补回 homebrew 等登录 shell 路径),必须先于
// RuntimeManager.applyEnv() 与 coding-agent 的 bash 执行。详见 fix-path.ts。
fixPath();

const PROTOCOL = "vetta";
const isMac = process.platform === "darwin";
const appRoot = app.isPackaged ? app.getAppPath() : process.cwd();
const buildDir = join(appRoot, "build");
const devMainEntryPath = join(appRoot, "dist/main/index.js");
// Command-specific parsers run before the top-level help parser so commands
// like `action -h` and `ocr -h` can render their own help text.
const ocrCliCommand = parseOcrCliCommand(process.argv);
const actionCliCommand = ocrCliCommand === null ? parseActionCliCommand(process.argv) : null;
const pdfCliCommand = ocrCliCommand === null && actionCliCommand === null ? parsePdfCliCommand(process.argv) : null;
const helpCliCommand =
	ocrCliCommand === null && actionCliCommand === null && pdfCliCommand === null
		? parseHelpCliCommand(process.argv)
		: null;
// `--agent-rpc` is the IM sidecar's discriminator: when present we
// short-circuit into @vetta/coding-agent's main and skip every UI/IPC
// bring-up below. See cli/agent-rpc-command.ts for the full rationale.
const agentRpcArgs =
	pdfCliCommand === null && ocrCliCommand === null && actionCliCommand === null && helpCliCommand === null
		? parseAgentRpcCommand(process.argv)
		: null;
const isCliMode =
	pdfCliCommand !== null ||
	ocrCliCommand !== null ||
	actionCliCommand !== null ||
	helpCliCommand !== null ||
	agentRpcArgs !== null;

// 给 V8 老生代一个明确上限：超过会抛 `RangeError: Invalid string length` /
// JS heap out of memory，能被 uncaughtException 接到并落盘栈；否则任 RSS 自然
// 膨胀，最终被 Linux OOM Killer SIGKILL，进程静默消失、连一行日志都来不及写。
// 4096MB 是当前桌面端图片/PDF/批量任务工作集的经验上限，未来如果常驻数据更大
// 再上调；CLI 模式跑短任务，沿用默认值即可。
if (!isCliMode) {
	app.commandLine.appendSwitch("js-flags", "--max-old-space-size=4096");
}

// agent-rpc mode talks to its parent over stdout via the coding-agent
// RPC protocol (NDJSON). Two console-related hazards we have to defuse:
//
//   1) installMainDiagnostics() monkey-patches console.log into a file
//      logger. coding-agent's RPC output goes through `console.log` so
//      the patch would swallow every response and the sidecar hangs on
//      handshake. Skip it.
//   2) Other main-process modules (installChromiumFetchForMain,
//      registerLocalNetworkAccess, sandbox probes…) call `console.log`
//      for status. With (1) skipped, those land on raw stdout and
//      interleave with RPC NDJSON, corrupting the protocol. Redirect
//      every console method to stderr in agent-rpc mode so the only
//      thing on stdout is coding-agent's own JSON.
if (agentRpcArgs) {
	const writeStderr = (level: string, args: unknown[]) => {
		const line = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a, null, 0))).join(" ");
		process.stderr.write(`[${level}] ${line}\n`);
	};
	console.log = (...args: unknown[]) => writeStderr("log", args);
	console.info = (...args: unknown[]) => writeStderr("info", args);
	console.warn = (...args: unknown[]) => writeStderr("warn", args);
	console.error = (...args: unknown[]) => writeStderr("error", args);
	console.debug = (...args: unknown[]) => writeStderr("debug", args);
	// Quietly swallow stdin errors so a parent-side EPIPE / ECONNRESET
	// doesn't surface as a Node unhandledException before readline has
	// a chance to attach its own listeners. Deliberately do NOT call
	// resume() here — that would drain bytes the downstream readline
	// expects to read as the handshake line.
	if (process.stdin) {
		process.stdin.on("error", () => {});
	}
} else {
	installMainDiagnostics();
}
const mainLog = getAppLogger("main");
process.env[VETTA_HOME_ENV] = getVettaHomePath();

if (isCliMode) {
	const cliUserDataDir =
		ocrCliCommand !== null
			? "vetta-ocr-cli"
			: pdfCliCommand !== null
				? "vetta-pdf-cli"
				: actionCliCommand !== null
					? `vetta-action-cli-${process.pid}`
					: helpCliCommand !== null
						? `vetta-help-cli-${process.pid}`
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
let localActionServer: LocalActionServerHandle | undefined;

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

		if (actionCliCommand) {
			const exitCode = await runActionCliCommand(actionCliCommand);
			app.exit(exitCode);
			return;
		}

		if (helpCliCommand) {
			const exitCode = runHelpCliCommand();
			app.exit(exitCode);
			return;
		}

		if (agentRpcArgs) {
			// agent-rpc 子进程会发出 LLM 网络请求；macOS 15 Local Network
			// Privacy 在 socket 层拦截 Node 默认 fetch 对 192.168.x / 10.x
			// 等私网地址的访问，OpenAI/Anthropic SDK 在这种情况下只能抛
			// "Connection error."。必须复用主进程对话页同款的两步规避：
			// 先触发 TCC 探针让 com.vetta.desktop 拿到 LAN 授权，再把
			// globalThis.fetch 换成 electron.net.fetch（Chromium 网络栈，
			// 不被 LNP 拦截）。PDF / OCR CLI 不需要这条，因为它们不发
			// 跨进程网络请求。
			registerLocalNetworkAccess();
			installChromiumFetchForMain();
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

		// im-gateway 独立 cwd（ADR-0005）：跟桌面「对话」物理分家。先把空目录建好，
		// 这样 sidecar 启动前 desktop 的 Claw tab 也能正常 listSessions（拿到空列表）。
		try {
			await mkdir(join(homedir(), ".vetta", "im-gateway", "conversation", ".vetta", "sessions"), {
				recursive: true,
			});
		} catch (err) {
			mainLog.error("failed to ensure im-gateway conversation dir", err);
		}

		// 托管运行时(ADR-0011):首启从内置 vendor 拷贝 node/python 到 ~/.vetta/runtimes,
		// 再把它们 + 国内镜像源注入全局 process.env。必须早于 getImHost().bootstrap()——
		// IM sidecar 继承本进程 env,coding-agent bash 子进程才能拿到托管运行时与镜像源。
		// 只做零网络的 vendor 拷贝,失败不阻断启动(面板可手动获取/升级)。
		try {
			const runtimeManager = getRuntimeManager();
			await runtimeManager.initialize();
			runtimeManager.applyEnv();
		} catch (err) {
			mainLog.error("runtime manager init failed", err);
		}

		try {
			let vettaAppPath: string;
			if (app.isPackaged) {
				vettaAppPath = process.execPath;
			} else {
				vettaAppPath = await ensureDevCliShim({
					appRoot,
					electronPath: process.execPath,
					mainEntryPath: devMainEntryPath,
				});
			}
			process.env.VETTA_DESKTOP_EXE = vettaAppPath;
			await persistVettaAppPath(vettaAppPath);
		} catch (err) {
			mainLog.error("failed to persist vettaAppPath", err);
		}

		const mainWindow = createWindow();

		// Register IPC handlers
		ipcTeardown = registerAllIpc(mainWindow.webContents);

		try {
			const actionRuntime = createAppActionRuntime();
			localActionServer = await startLocalActionServer(actionRuntime, {
				endpointFilePath: getActionServerEndpointFilePath(),
			});
			mainLog.info("local action server ready", {
				transport: localActionServer.endpoint.transport,
				url: localActionServer.endpoint.url,
			});
		} catch (err) {
			mainLog.error("failed to start local action server", err);
		}

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
	if (localActionServer) {
		try {
			await localActionServer.close();
		} catch (err) {
			mainLog.error("local action server shutdown failed", err);
		}
		localActionServer = undefined;
	}
	app.exit(0);
});
