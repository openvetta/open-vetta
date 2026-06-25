import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, Menu, screen } from "electron";
import { PET_ACTIONS } from "../shared/pet-actions.js";
import {
	DEFAULT_PET_CONFIG,
	getPetVideoSize,
	normalizePetConfig,
	normalizePetSize,
	normalizePetVideoSize,
	normalizePetVideoSizeForWindow,
	PET_SIZE_MAX,
	PET_SIZE_MIN,
	PET_SIZE_STEP,
	PET_VIDEO_SIZE_STEP,
	type PetConfig,
} from "../shared/pet-config.js";
import { PET_COMMAND_CHANNEL, type PetCommand, type PetResizeCorner } from "../shared/pet-ipc.js";
import { allowProjectRoot, readConfigSync, readDesktopConfig, writeDesktopConfig } from "./ipc/fs.js";
import { getAppLogger } from "./logger.js";
import { MEDIA_PROTOCOL_SCHEME } from "./media-protocol.js";
import { iconPath } from "./window-manager.js";

const log = getAppLogger("pet-window");
const appRoot = app.isPackaged ? app.getAppPath() : process.cwd();
const resDir = app.isPackaged ? appRoot : join(appRoot, "dist");
const buildDir = app.isPackaged ? join(process.resourcesPath, "build") : join(appRoot, "build");
const petMediaDir = join(buildDir, "pet");
const devServerUrl = process.env.VETTA_DESKTOP_DEV_URL;
const petPreloadPath = join(resDir, "preload/pet.js");
const PET_BOUNDS_TOLERANCE = 1;

let petWindow: BrowserWindow | null = null;
let petConfig: PetConfig = DEFAULT_PET_CONFIG;
let persistSizeTimer: ReturnType<typeof setTimeout> | undefined;
let isApplyingPetBounds = false;
let windowResizeSession: PetWindowResizeSession | undefined;
let isMousePassthroughEnabled = false;

type PetWindowResizeSession = {
	startBounds: Electron.Rectangle;
	corner: PetResizeCorner;
	lastSize: number;
};

type PetVideoResolution = {
	id: string;
	fileName: string;
	path: string;
	found: boolean;
	url?: string;
};

function resolvePetVideo(action: (typeof PET_ACTIONS)[number]): PetVideoResolution {
	const videoPath = join(petMediaDir, action.fileName);
	if (!existsSync(videoPath)) {
		return {
			id: action.id,
			fileName: action.fileName,
			path: videoPath,
			found: false,
		};
	}
	return {
		id: action.id,
		fileName: action.fileName,
		path: videoPath,
		found: true,
		url: `${MEDIA_PROTOCOL_SCHEME}://local/stream?path=${encodeURIComponent(videoPath)}&kind=video`,
	};
}

function getStoredPetConfig(): PetConfig {
	return normalizePetConfig(readConfigSync().pet);
}

function getInitialBounds(size: number): Electron.Rectangle {
	const { workArea } = screen.getPrimaryDisplay();
	return {
		width: size,
		height: size,
		x: workArea.x + workArea.width - size - 24,
		y: workArea.y + workArea.height - size - 24,
	};
}

function buildPetQuery(config: PetConfig): string {
	const params = new URLSearchParams();
	for (const action of PET_ACTIONS) {
		const video = resolvePetVideo(action);
		if (video.url) {
			params.set(action.id, video.url);
		}
		params.set(
			`${action.id}VideoSize`,
			String(normalizePetVideoSizeForWindow(getPetVideoSize(config, action.id), config.size)),
		);
	}
	params.set("autoMode", String(config.autoMode));
	params.set("debugFrame", String(config.debugFrame));
	if (config.defaultActionId) {
		params.set("initialAction", config.defaultActionId);
	}
	return params.toString();
}

function getCenteredBounds(current: Electron.Rectangle, size: number): Electron.Rectangle {
	return {
		width: size,
		height: size,
		x: Math.round(current.x + current.width / 2 - size / 2),
		y: Math.round(current.y + current.height / 2 - size / 2),
	};
}

function getCornerAnchoredBounds(
	current: Electron.Rectangle,
	size: number,
	corner: PetResizeCorner | undefined,
): Electron.Rectangle {
	if (!corner) {
		return getCenteredBounds(current, size);
	}

	const right = current.x + current.width;
	const bottom = current.y + current.height;
	return {
		width: size,
		height: size,
		x: corner.endsWith("left") ? right - size : current.x,
		y: corner.startsWith("top") ? bottom - size : current.y,
	};
}

function isSeverelyInvalidPetBounds(bounds: Electron.Rectangle): boolean {
	return (
		Math.abs(bounds.width - bounds.height) > PET_BOUNDS_TOLERANCE ||
		bounds.width < PET_SIZE_MIN - PET_BOUNDS_TOLERANCE ||
		bounds.height < PET_SIZE_MIN - PET_BOUNDS_TOLERANCE ||
		bounds.width > PET_SIZE_MAX + PET_BOUNDS_TOLERANCE ||
		bounds.height > PET_SIZE_MAX + PET_BOUNDS_TOLERANCE
	);
}

function hasUnacceptablePetSizeChange(bounds: Electron.Rectangle, expectedSize: number): boolean {
	return (
		Math.abs(bounds.width - expectedSize) > PET_BOUNDS_TOLERANCE ||
		Math.abs(bounds.height - expectedSize) > PET_BOUNDS_TOLERANCE ||
		isSeverelyInvalidPetBounds(bounds)
	);
}

function setPetBounds(win: BrowserWindow, bounds: Electron.Rectangle, reason: string): void {
	const before = win.getBounds();
	const size = normalizePetSize(Math.max(bounds.width, bounds.height));
	try {
		isApplyingPetBounds = true;
		win.setBounds({
			x: bounds.x,
			y: bounds.y,
			width: size,
			height: size,
		});
	} finally {
		isApplyingPetBounds = false;
	}
	const after = win.getBounds();
	if (isSeverelyInvalidPetBounds(after)) {
		log.warn("set bounds produced invalid size", {
			reason,
			before,
			requested: bounds,
			after,
			limits: { min: PET_SIZE_MIN, max: PET_SIZE_MAX },
		});
	}
}

function normalizeCurrentPetBounds(win: BrowserWindow): number {
	const bounds = win.getBounds();
	const size = normalizePetSize(Math.max(bounds.width, bounds.height));
	if (bounds.width !== size || bounds.height !== size) {
		setPetBounds(win, getCenteredBounds(bounds, size), "normalize-current-bounds");
	}
	return size;
}

async function persistPetWindowSize(size: number): Promise<void> {
	const nextSize = normalizePetSize(size);
	if (petConfig.size === nextSize) return;
	petConfig = { ...petConfig, size: nextSize };
	const current = await readDesktopConfig();
	await writeDesktopConfig({
		...current,
		pet: normalizePetConfig({ ...current.pet, size: nextSize }),
	});
}

function schedulePersistPetWindowSize(size: number): void {
	if (persistSizeTimer) {
		clearTimeout(persistSizeTimer);
	}
	persistSizeTimer = setTimeout(() => {
		persistSizeTimer = undefined;
		void persistPetWindowSize(size);
	}, 300);
}

async function persistPetVideoSize(actionId: (typeof PET_ACTIONS)[number]["id"], size: number): Promise<void> {
	const windowSize = petWindow && !petWindow.isDestroyed() ? petWindow.getBounds().width : petConfig.size;
	const nextSize = normalizePetVideoSizeForWindow(size, windowSize);
	if (getPetVideoSize(petConfig, actionId) === nextSize) return;
	petConfig = {
		...petConfig,
		videoSizeByAction: {
			...petConfig.videoSizeByAction,
			[actionId]: nextSize,
		},
	};
	const current = await readDesktopConfig();
	await writeDesktopConfig({
		...current,
		pet: normalizePetConfig({
			...current.pet,
			videoSizeByAction: {
				...current.pet?.videoSizeByAction,
				[actionId]: nextSize,
			},
		}),
	});
}

function getPetEntryUrl(query: string): string {
	if (devServerUrl) {
		return query.length > 0 ? `${devServerUrl}/pet.html?${query}` : `${devServerUrl}/pet.html`;
	}
	const petEntryUrl = pathToFileURL(join(resDir, "renderer/pet.html"));
	petEntryUrl.search = query;
	return petEntryUrl.toString();
}

function loadPetEntry(win: BrowserWindow): void {
	const query = buildPetQuery(petConfig);
	const url = getPetEntryUrl(query);
	log.info("load entry", {
		mode: devServerUrl ? "dev-server" : "file",
		devServerUrl,
		url,
	});
	const loadPromise = win.loadURL(url);

	void loadPromise.catch((error: unknown) => {
		log.error("loadURL failed", error);
	});
}

function sendPetCommand(win: BrowserWindow, command: PetCommand): void {
	win.webContents.send(PET_COMMAND_CHANNEL, command);
}

function showContextMenu(win: BrowserWindow): void {
	const alwaysOnTop = win.isAlwaysOnTop();
	Menu.buildFromTemplate([
		{
			label: "动作",
			submenu: [
				...PET_ACTIONS.map((action) => ({
					label: action.label,
					click: () => {
						petConfig = { ...petConfig, autoMode: false, defaultActionId: action.id };
						sendPetCommand(win, { type: "set-action", actionId: action.id });
					},
				})),
				{ type: "separator" as const },
				{
					label: "随机动作",
					click: () => {
						petConfig = { ...petConfig, autoMode: false };
						sendPetCommand(win, { type: "random-action" });
					},
				},
			],
		},
		{
			label: "自动切换",
			type: "checkbox",
			checked: petConfig.autoMode,
			click: (menuItem) => {
				petConfig = { ...petConfig, autoMode: menuItem.checked };
				sendPetCommand(win, { type: "set-auto-mode", enabled: petConfig.autoMode });
			},
		},
		{ type: "separator" },
		{
			label: "隐藏桌宠",
			click: () => win.hide(),
		},
		{
			label: alwaysOnTop ? "取消置顶" : "保持置顶",
			click: () => {
				win.setAlwaysOnTop(!alwaysOnTop, "screen-saver");
			},
		},
		{ type: "separator" },
		{
			label: "关闭桌宠",
			click: () => win.close(),
		},
	]).popup({ window: win });
}

export function getPetWindow(): BrowserWindow | null {
	return petWindow;
}

export function getPetConfig(): PetConfig {
	return petConfig;
}

export function initializePetWindow(): BrowserWindow | null {
	petConfig = getStoredPetConfig();
	if (!petConfig.enabled) {
		log.info("startup skipped", petConfig);
		return null;
	}
	return createPetWindow();
}

export function createPetWindow(): BrowserWindow {
	petConfig = getStoredPetConfig();
	if (petWindow && !petWindow.isDestroyed()) {
		log.info("reuse existing window", {
			isVisible: petWindow.isVisible(),
			bounds: petWindow.getBounds(),
		});
		return petWindow;
	}

	const initialBounds = getInitialBounds(petConfig.size);
	allowProjectRoot(petMediaDir);
	const videos = PET_ACTIONS.map(resolvePetVideo);
	const foundVideos = videos.filter((video) => video.found);
	log.info("create requested", {
		isPackaged: app.isPackaged,
		appRoot,
		resDir,
		buildDir,
		petMediaDir,
		devServerUrl,
		initialBounds,
		foundVideos: foundVideos.map((video) => video.fileName),
		missingVideos: videos.filter((video) => !video.found).map((video) => video.fileName),
		petConfig,
	});

	petWindow = new BrowserWindow({
		...initialBounds,
		frame: false,
		resizable: false,
		movable: true,
		minWidth: PET_SIZE_MIN,
		minHeight: PET_SIZE_MIN,
		maxWidth: PET_SIZE_MAX,
		maxHeight: PET_SIZE_MAX,
		show: false,
		skipTaskbar: true,
		transparent: true,
		hasShadow: false,
		alwaysOnTop: petConfig.alwaysOnTop,
		backgroundColor: "#00000000",
		icon: iconPath[process.platform],
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			preload: petPreloadPath,
		},
	});

	petWindow.setAlwaysOnTop(petConfig.alwaysOnTop, "screen-saver");
	petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	// macOS: `visibleOnFullScreen` 让 Electron 把进程 activation policy 转成
	// accessory（transformProcessType），副作用是整个 app 被移出 Dock。桌宠需要浮在
	// 全屏应用之上，又不能丢主窗口的 Dock 图标，因此显式 dock.show() 把策略转回 regular。
	if (process.platform === "darwin") {
		void app.dock.show();
	}
	petWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
	petWindow.webContents.on("preload-error", (_event, preloadPathForError, error) => {
		log.error("preload-error", { preloadPath: preloadPathForError, error });
	});
	petWindow.webContents.on("context-menu", (event) => {
		event.preventDefault();
		if (!petWindow || petWindow.isDestroyed()) return;
		showContextMenu(petWindow);
	});
	petWindow.on("system-context-menu", (event) => {
		event.preventDefault();
		if (!petWindow || petWindow.isDestroyed()) return;
		showContextMenu(petWindow);
	});
	petWindow.on("resize", () => {
		if (!petWindow || petWindow.isDestroyed()) return;
		if (isApplyingPetBounds) return;
		if (windowResizeSession) return;
		const bounds = petWindow.getBounds();
		if (isSeverelyInvalidPetBounds(bounds)) {
			log.warn("resize event produced invalid size", {
				bounds,
				limits: { min: PET_SIZE_MIN, max: PET_SIZE_MAX },
			});
			schedulePersistPetWindowSize(normalizeCurrentPetBounds(petWindow));
			return;
		}
		schedulePersistPetWindowSize(normalizePetSize(bounds.width));
	});
	petWindow.on("ready-to-show", () => {
		if (!petWindow || petWindow.isDestroyed()) return;
		petWindow.showInactive();
		log.info("ready-to-show", {
			isVisible: petWindow.isVisible(),
			bounds: petWindow.getBounds(),
			isAlwaysOnTop: petWindow.isAlwaysOnTop(),
		});
	});
	petWindow.webContents.on("did-finish-load", () => {
		if (!petWindow || petWindow.isDestroyed()) return;
		log.info("did-finish-load", {
			url: petWindow.webContents.getURL(),
			isVisible: petWindow.isVisible(),
			bounds: petWindow.getBounds(),
		});
	});
	petWindow.on("closed", () => {
		petWindow = null;
		log.info("closed");
	});
	petWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
		log.error("did-fail-load", {
			errorCode,
			errorDescription,
			validatedURL,
			isMainFrame,
		});
	});

	loadPetEntry(petWindow);
	return petWindow;
}

export function showPetWindow(): BrowserWindow {
	const win = petWindow && !petWindow.isDestroyed() ? petWindow : createPetWindow();
	if (!win.isVisible()) {
		win.showInactive();
	}
	log.info("show requested", {
		isVisible: win.isVisible(),
		bounds: win.getBounds(),
	});
	return win;
}

export function applyPetConfig(config: PetConfig): void {
	petConfig = normalizePetConfig(config);

	if (!petConfig.enabled) {
		if (petWindow && !petWindow.isDestroyed()) {
			petWindow.hide();
		}
		log.info("config applied hidden", petConfig);
		return;
	}

	const win = petWindow && !petWindow.isDestroyed() ? petWindow : createPetWindow();
	win.setAlwaysOnTop(petConfig.alwaysOnTop, "screen-saver");
	const bounds = win.getBounds();
	if (bounds.width !== petConfig.size || bounds.height !== petConfig.size) {
		setPetBounds(
			win,
			{
				x: bounds.x + bounds.width - petConfig.size,
				y: bounds.y + bounds.height - petConfig.size,
				width: petConfig.size,
				height: petConfig.size,
			},
			"apply-config",
		);
	}
	if (!win.isVisible()) {
		win.showInactive();
	}
	sendPetCommand(win, { type: "set-auto-mode", enabled: petConfig.autoMode });
	sendPetCommand(win, { type: "set-debug-frame", enabled: petConfig.debugFrame });
	for (const action of PET_ACTIONS) {
		sendPetCommand(win, {
			type: "set-video-size",
			actionId: action.id,
			size: normalizePetVideoSizeForWindow(getPetVideoSize(petConfig, action.id), win.getBounds().width),
		});
	}
	if (!petConfig.autoMode && petConfig.defaultActionId) {
		sendPetCommand(win, { type: "set-action", actionId: petConfig.defaultActionId });
	}
	log.info("config applied", {
		petConfig,
		isVisible: win.isVisible(),
		bounds: win.getBounds(),
	});
}

export async function resizePetWindowByWheel(deltaY: number): Promise<void> {
	if (typeof deltaY !== "number" || !Number.isFinite(deltaY) || deltaY === 0) return;
	const win = petWindow && !petWindow.isDestroyed() ? petWindow : createPetWindow();
	const bounds = win.getBounds();
	const direction = deltaY < 0 ? 1 : -1;
	const nextSize = normalizePetSize(bounds.width + direction * PET_SIZE_STEP);
	if (nextSize === bounds.width) return;
	setPetBounds(win, getCenteredBounds(bounds, nextSize), "wheel-resize-window");
	await persistPetWindowSize(nextSize);
}

export function movePetWindowBy(deltaX: number, deltaY: number): void {
	if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;
	const win = petWindow && !petWindow.isDestroyed() ? petWindow : createPetWindow();
	const bounds = win.getBounds();
	const x = Math.round(bounds.x + deltaX);
	const y = Math.round(bounds.y + deltaY);
	const normalizedSize = normalizePetSize(Math.max(bounds.width, bounds.height));
	if (bounds.width !== normalizedSize || bounds.height !== normalizedSize) {
		setPetBounds(
			win,
			{
				x,
				y,
				width: normalizedSize,
				height: normalizedSize,
			},
			"move-normalize-before-position",
		);
		schedulePersistPetWindowSize(normalizedSize);
		return;
	}
	win.setPosition(x, y, false);
	const after = win.getBounds();
	if (hasUnacceptablePetSizeChange(after, normalizedSize)) {
		log.warn("move size changed unexpectedly", {
			delta: { x: deltaX, y: deltaY },
			before: bounds,
			after,
			restoredSize: normalizedSize,
			limits: { min: PET_SIZE_MIN, max: PET_SIZE_MAX },
		});
		setPetBounds(
			win,
			{
				x: after.x,
				y: after.y,
				width: normalizedSize,
				height: normalizedSize,
			},
			"restore-size-after-move",
		);
	}
}

export function beginPetWindowResize(corner: PetResizeCorner): void {
	const win = petWindow && !petWindow.isDestroyed() ? petWindow : createPetWindow();
	const bounds = win.getBounds();
	const size = normalizePetSize(Math.max(bounds.width, bounds.height));
	const startBounds =
		bounds.width === size && bounds.height === size
			? bounds
			: {
					...bounds,
					width: size,
					height: size,
				};
	windowResizeSession = {
		startBounds,
		corner,
		lastSize: size,
	};
}

export async function setPetWindowSize(size: number, corner?: PetResizeCorner): Promise<void> {
	if (!Number.isFinite(size)) return;
	const win = petWindow && !petWindow.isDestroyed() ? petWindow : createPetWindow();
	const bounds = win.getBounds();
	const nextSize = normalizePetSize(size);
	if (nextSize === bounds.width) return;
	const session = windowResizeSession && windowResizeSession.corner === corner ? windowResizeSession : undefined;
	const baseBounds = session?.startBounds ?? bounds;
	setPetBounds(win, getCornerAnchoredBounds(baseBounds, nextSize, corner), "corner-resize-window");
	if (session) {
		windowResizeSession = { ...session, lastSize: nextSize };
		return;
	}
	schedulePersistPetWindowSize(nextSize);
}

export async function endPetWindowResize(size: number): Promise<void> {
	const session = windowResizeSession;
	windowResizeSession = undefined;
	if (!Number.isFinite(size)) return;
	const nextSize = normalizePetSize(size);
	const win = petWindow && !petWindow.isDestroyed() ? petWindow : createPetWindow();
	if (session) {
		setPetBounds(
			win,
			getCornerAnchoredBounds(session.startBounds, nextSize, session.corner),
			"end-corner-resize-window",
		);
	}
	await persistPetWindowSize(nextSize);
}

export async function resizePetVideoByWheel(
	actionId: (typeof PET_ACTIONS)[number]["id"],
	deltaY: number,
): Promise<void> {
	if (typeof deltaY !== "number" || !Number.isFinite(deltaY) || deltaY === 0) return;
	const win = petWindow && !petWindow.isDestroyed() ? petWindow : createPetWindow();
	const direction = deltaY < 0 ? 1 : -1;
	const bounds = win.getBounds();
	const nextSize = normalizePetVideoSize(getPetVideoSize(petConfig, actionId) + direction * PET_VIDEO_SIZE_STEP);
	if (nextSize > bounds.width) {
		setPetBounds(win, getCenteredBounds(bounds, normalizePetSize(nextSize)), "expand-window-for-video");
		await persistPetWindowSize(normalizePetSize(nextSize));
	}
	await persistPetVideoSize(actionId, nextSize);
	sendPetCommand(win, {
		type: "set-video-size",
		actionId,
		size: nextSize,
	});
}

export function setPetMousePassthrough(enabled: boolean): void {
	const win = petWindow && !petWindow.isDestroyed() ? petWindow : createPetWindow();
	if (isMousePassthroughEnabled === enabled) return;
	isMousePassthroughEnabled = enabled;
	win.setIgnoreMouseEvents(enabled, { forward: true });
}

export async function setPetVideoSize(actionId: (typeof PET_ACTIONS)[number]["id"], size: number): Promise<void> {
	const win = petWindow && !petWindow.isDestroyed() ? petWindow : createPetWindow();
	const nextSize = normalizePetVideoSizeForWindow(size, win.getBounds().width);
	await persistPetVideoSize(actionId, nextSize);
	sendPetCommand(win, {
		type: "set-video-size",
		actionId,
		size: nextSize,
	});
}
