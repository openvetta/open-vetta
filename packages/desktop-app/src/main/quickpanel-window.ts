import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, screen } from "electron";
import { QUICK_PANEL_CHANNELS } from "../shared/quickpanel-ipc.js";
import { getAppLogger } from "./logger.js";
import { iconPath } from "./window-manager.js";

const log = getAppLogger("quickpanel-window");
const isMac = process.platform === "darwin";
const appRoot = app.isPackaged ? app.getAppPath() : process.cwd();
const resDir = app.isPackaged ? appRoot : join(appRoot, "dist");
const devServerUrl = process.env.VETTA_DESKTOP_DEV_URL;
const quickPanelPreloadPath = join(resDir, "preload/quickpanel.js");

const QUICK_PANEL_WIDTH = 640;
// 高度贴合内容：输入框(56) + 分隔线(1) + 「最近会话」标题(~28) + 5 个 item 滚动区(250) + 外层 p-2(16)。
// 列表固定 5 项高度、超出滚动（见 RecentList），故窗口高度恒定。
const QUICK_PANEL_HEIGHT = 352;
// 面板距离工作区顶部约 20%。
const QUICK_PANEL_TOP_RATIO = 0.2;

let quickPanelWindow: BrowserWindow | null = null;

function getQuickPanelEntryUrl(): string {
	if (devServerUrl) {
		return `${devServerUrl}/quickpanel.html`;
	}
	return pathToFileURL(join(resDir, "renderer/quickpanel.html")).toString();
}

function loadQuickPanelEntry(win: BrowserWindow): void {
	const url = getQuickPanelEntryUrl();
	log.info("load entry", {
		mode: devServerUrl ? "dev-server" : "file",
		devServerUrl,
		url,
	});
	void win.loadURL(url).catch((error: unknown) => {
		log.error("loadURL failed", error);
	});
}

// 把面板定位到光标所在显示器：水平居中、距顶部约 20%。
function positionQuickPanelWindow(win: BrowserWindow): void {
	const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
	const { workArea } = display;
	const x = Math.round(workArea.x + (workArea.width - QUICK_PANEL_WIDTH) / 2);
	const y = Math.round(workArea.y + workArea.height * QUICK_PANEL_TOP_RATIO);
	win.setBounds({ x, y, width: QUICK_PANEL_WIDTH, height: QUICK_PANEL_HEIGHT });
}

export function getQuickPanelWindow(): BrowserWindow | null {
	return quickPanelWindow;
}

export function createQuickPanelWindow(): BrowserWindow {
	if (quickPanelWindow && !quickPanelWindow.isDestroyed()) {
		return quickPanelWindow;
	}

	log.info("create requested", {
		isPackaged: app.isPackaged,
		appRoot,
		resDir,
		devServerUrl,
		quickPanelPreloadPath,
	});

	quickPanelWindow = new BrowserWindow({
		width: QUICK_PANEL_WIDTH,
		height: QUICK_PANEL_HEIGHT,
		frame: false,
		transparent: true,
		backgroundColor: "#00000000",
		hasShadow: false,
		resizable: false,
		movable: true,
		show: false,
		skipTaskbar: true,
		alwaysOnTop: true,
		fullscreenable: false,
		minimizable: false,
		maximizable: false,
		icon: iconPath[process.platform],
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			preload: quickPanelPreloadPath,
		},
	});

	quickPanelWindow.setAlwaysOnTop(true, "floating");
	if (isMac) {
		quickPanelWindow.setVisibleOnAllWorkspaces(true, {
			visibleOnFullScreen: true,
			skipTransformProcessType: true,
		});
	}
	quickPanelWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
	quickPanelWindow.webContents.on("preload-error", (_event, preloadPathForError, error) => {
		log.error("preload-error", { preloadPath: preloadPathForError, error });
	});
	quickPanelWindow.webContents.on(
		"did-fail-load",
		(_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
			log.error("did-fail-load", { errorCode, errorDescription, validatedURL, isMainFrame });
		},
	);
	quickPanelWindow.on("blur", () => {
		hideQuickPanelWindow();
	});
	quickPanelWindow.on("closed", () => {
		quickPanelWindow = null;
		log.info("closed");
	});

	loadQuickPanelEntry(quickPanelWindow);
	return quickPanelWindow;
}

export function showQuickPanelWindow(): void {
	const win = quickPanelWindow && !quickPanelWindow.isDestroyed() ? quickPanelWindow : createQuickPanelWindow();
	positionQuickPanelWindow(win);
	win.show();
	win.focus();
	if (!win.webContents.isDestroyed()) {
		win.webContents.send(QUICK_PANEL_CHANNELS.ON_SHOWN);
	}
	log.info("show requested", { bounds: win.getBounds() });
}

export function hideQuickPanelWindow(): void {
	if (!quickPanelWindow || quickPanelWindow.isDestroyed()) return;
	if (!quickPanelWindow.isVisible()) return;
	quickPanelWindow.hide();
	log.info("hide requested");
}

export function toggleQuickPanelWindow(): void {
	if (quickPanelWindow && !quickPanelWindow.isDestroyed() && quickPanelWindow.isVisible()) {
		hideQuickPanelWindow();
		return;
	}
	showQuickPanelWindow();
}
