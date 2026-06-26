import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, Menu, type MenuItemConstructorOptions, screen } from "electron";
import { PET_ACTIONS } from "../shared/pet-actions.js";
import { getPetBubbleStyle, type PetBubbleStyleId } from "../shared/pet-bubbles.js";
import {
	DEFAULT_PET_CONFIG,
	getPetScaledVideoSize,
	getPetVideoBaseSize,
	getPetVideoScaleForSize,
	normalizePetConfig,
	normalizePetSize,
	normalizePetVideoScale,
	normalizePetVideoSize,
	normalizePetVideoSizeForWindow,
	PET_SIZE_MAX,
	PET_SIZE_MIN,
	PET_SIZE_STEP,
	PET_VIDEO_SIZE_STEP,
	type PetConfig,
} from "../shared/pet-config.js";
import { PET_COMMAND_CHANNEL, type PetCommand, type PetResizeCorner, type PetVideoHitbox } from "../shared/pet-ipc.js";
import { mainT } from "./i18n/index.js";
import { allowProjectRoot } from "./ipc/fs.js";
import { getAppLogger } from "./logger.js";
import { MEDIA_PROTOCOL_SCHEME } from "./media-protocol.js";
import { readPetConfigSync, writePetConfig } from "./pet-config-store.js";
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
let petVideoHitbox: PetVideoHitbox | undefined;
let mousePassthroughPollTimer: ReturnType<typeof setInterval> | undefined;

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

function resolvePetBubbleDecorUrl(styleId: PetBubbleStyleId): string | undefined {
	const decor = getPetBubbleStyle(styleId).decor;
	if (!decor) return undefined;

	const decorPath = join(petMediaDir, decor.fileName);
	if (!existsSync(decorPath)) return undefined;
	return `${MEDIA_PROTOCOL_SCHEME}://local/stream?path=${encodeURIComponent(decorPath)}`;
}

function getStoredPetConfig(): PetConfig {
	return readPetConfigSync();
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
	const bubbleDecorUrl = resolvePetBubbleDecorUrl(config.bubbleStyleId);
	params.set("bubbleStyle", config.bubbleStyleId);
	if (bubbleDecorUrl) params.set("bubbleDecor", bubbleDecorUrl);
	for (const action of PET_ACTIONS) {
		const video = resolvePetVideo(action);
		if (video.url) {
			params.set(action.id, video.url);
		}
		params.set(`${action.id}VideoBaseSize`, String(getPetVideoBaseSize(config, action.id)));
	}
	params.set("videoScale", String(config.videoScale));
	params.set("autoMode", String(config.autoMode));
	params.set("debugFrame", String(config.debugFrame));
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
	await writePetConfig(petConfig);
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

async function persistPetVideoScale(scale: number): Promise<void> {
	const nextScale = normalizePetVideoScale(scale);
	if (petConfig.videoScale === nextScale) return;
	petConfig = { ...petConfig, videoScale: nextScale };
	await writePetConfig(petConfig);
}

async function persistPetVideoBaseSize(actionId: (typeof PET_ACTIONS)[number]["id"], baseSize: number): Promise<void> {
	const windowSize = petWindow && !petWindow.isDestroyed() ? petWindow.getBounds().width : petConfig.size;
	const nextBaseSize = normalizePetVideoSizeForWindow(baseSize, windowSize);
	if (getPetVideoBaseSize(petConfig, actionId) === nextBaseSize) return;
	petConfig = {
		...petConfig,
		videoBaseSizeByAction: {
			...petConfig.videoBaseSizeByAction,
			[actionId]: nextBaseSize,
		},
	};
	await writePetConfig(petConfig);
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

export function sendPetCommandToWindow(command: PetCommand): void {
	if (!petWindow || petWindow.isDestroyed()) return;
	sendPetCommand(petWindow, command);
}

function isCursorOverPetVideo(win: BrowserWindow): boolean {
	if (!petVideoHitbox) return false;
	const cursor = screen.getCursorScreenPoint();
	const bounds = win.getBounds();
	const x = cursor.x - bounds.x;
	const y = cursor.y - bounds.y;
	return (
		x >= petVideoHitbox.x &&
		x <= petVideoHitbox.x + petVideoHitbox.width &&
		y >= petVideoHitbox.y &&
		y <= petVideoHitbox.y + petVideoHitbox.height
	);
}

function syncPetMousePassthroughForCursor(): void {
	if (!petWindow || petWindow.isDestroyed()) return;
	if (petConfig.debugFrame) {
		setPetMousePassthrough(false);
		return;
	}
	setPetMousePassthrough(!isCursorOverPetVideo(petWindow));
}

function startMousePassthroughPolling(): void {
	if (mousePassthroughPollTimer) return;
	mousePassthroughPollTimer = setInterval(syncPetMousePassthroughForCursor, 50);
}

function stopMousePassthroughPolling(): void {
	if (!mousePassthroughPollTimer) return;
	clearInterval(mousePassthroughPollTimer);
	mousePassthroughPollTimer = undefined;
}

function shouldShowPetDevToolsMenuItem(): boolean {
	return !app.isPackaged || process.env.VETTA_PET_DEVTOOLS === "1";
}

function showContextMenu(win: BrowserWindow): void {
	const alwaysOnTop = win.isAlwaysOnTop();
	const template: MenuItemConstructorOptions[] = [
		{
			label: "动作",
			submenu: [
				...PET_ACTIONS.map((action) => ({
					label: action.label,
					click: () => {
						sendPetCommand(win, { type: "set-action", actionId: action.id, source: "user", holdMs: 10_000 });
					},
				})),
				{ type: "separator" as const },
				{
					label: "随机动作",
					click: () => {
						sendPetCommand(win, { type: "random-action", source: "user", holdMs: 10_000 });
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
		...(shouldShowPetDevToolsMenuItem()
			? [
					{ type: "separator" as const },
					{
						label: mainT("pet.openDevTools"),
						click: () => {
							win.webContents.openDevTools({ mode: "detach" });
						},
					},
				]
			: []),
		{ type: "separator" },
		{
			label: "关闭桌宠",
			click: () => win.close(),
		},
	];
	Menu.buildFromTemplate(template).popup({ window: win });
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
	// macOS: 默认情况下 setVisibleOnAllWorkspaces 会在 UIElementApplication 与
	// ForegroundApplication 之间切换进程类型（transformProcessType），每次调用都会短暂
	// 隐藏窗口和 Dock —— 这正是桌宠开启时的卡顿/闪烁、Dock 图标消失，以及 dev 下 devtools
	// 打不开（进程重新向窗口服务器注册、焦点被打断）的根因。`screen-saver` 层级已能浮在全屏
	// 应用之上，故用 skipTransformProcessType 跳过这次转换，既保留全屏浮层又不丢 Dock、不卡顿。
	petWindow.setVisibleOnAllWorkspaces(true, {
		visibleOnFullScreen: true,
		skipTransformProcessType: true,
	});
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
		stopMousePassthroughPolling();
		petVideoHitbox = undefined;
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
		log.debug("config applied hidden", petConfig);
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
	sendPetCommand(win, { type: "set-video-scale", scale: petConfig.videoScale });
	const bubbleDecorUrl = resolvePetBubbleDecorUrl(petConfig.bubbleStyleId);
	sendPetCommand(win, {
		type: "set-bubble-style",
		styleId: petConfig.bubbleStyleId,
		...(bubbleDecorUrl ? { decorUrl: bubbleDecorUrl } : {}),
	});
	for (const action of PET_ACTIONS) {
		sendPetCommand(win, {
			type: "set-video-base-size",
			actionId: action.id,
			baseSize: getPetVideoBaseSize(petConfig, action.id),
		});
	}
	log.debug("config applied", {
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
	const currentSize = getPetScaledVideoSize(petConfig, actionId);
	const nextSize = normalizePetVideoSize(currentSize + direction * PET_VIDEO_SIZE_STEP);
	const nextScale = getPetVideoScaleForSize(petConfig, actionId, nextSize);
	if (nextSize > bounds.width) {
		setPetBounds(win, getCenteredBounds(bounds, normalizePetSize(nextSize)), "expand-window-for-video");
		await persistPetWindowSize(normalizePetSize(nextSize));
	}
	await persistPetVideoScale(nextScale);
	sendPetCommand(win, {
		type: "set-video-scale",
		scale: nextScale,
	});
}

export function setPetMousePassthrough(enabled: boolean): void {
	const win = petWindow && !petWindow.isDestroyed() ? petWindow : undefined;
	if (!win) return;
	if (isMousePassthroughEnabled === enabled) return;
	isMousePassthroughEnabled = enabled;
	win.setIgnoreMouseEvents(enabled, { forward: true });
}

export function setPetVideoHitbox(hitbox: PetVideoHitbox | undefined): void {
	petVideoHitbox =
		hitbox && hitbox.width > 0 && hitbox.height > 0
			? {
					x: Math.round(hitbox.x),
					y: Math.round(hitbox.y),
					width: Math.round(hitbox.width),
					height: Math.round(hitbox.height),
				}
			: undefined;
	if (petVideoHitbox) {
		startMousePassthroughPolling();
		syncPetMousePassthroughForCursor();
		return;
	}
	stopMousePassthroughPolling();
	setPetMousePassthrough(false);
}

export async function setPetVideoBaseSize(
	actionId: (typeof PET_ACTIONS)[number]["id"],
	baseSize: number,
): Promise<void> {
	const win = petWindow && !petWindow.isDestroyed() ? petWindow : createPetWindow();
	const nextBaseSize = normalizePetVideoSizeForWindow(baseSize, win.getBounds().width);
	await persistPetVideoBaseSize(actionId, nextBaseSize);
	sendPetCommand(win, {
		type: "set-video-base-size",
		actionId,
		baseSize: nextBaseSize,
	});
}
