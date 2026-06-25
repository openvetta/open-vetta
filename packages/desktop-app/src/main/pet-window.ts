import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, Menu, screen } from "electron";
import { PET_ACTIONS } from "../shared/pet-actions.js";
import { DEFAULT_PET_CONFIG, normalizePetConfig, type PetConfig } from "../shared/pet-config.js";
import { PET_COMMAND_CHANNEL, type PetCommand } from "../shared/pet-ipc.js";
import { allowProjectRoot, readConfigSync } from "./ipc/fs.js";
import { getAppLogger } from "./logger.js";
import { MEDIA_PROTOCOL_SCHEME } from "./media-protocol.js";
import { iconPath } from "./window-manager.js";

const appRoot = app.isPackaged ? app.getAppPath() : process.cwd();
const resDir = app.isPackaged ? appRoot : join(appRoot, "dist");
const buildDir = app.isPackaged ? join(process.resourcesPath, "build") : join(appRoot, "build");
const petMediaDir = join(buildDir, "pet");
const devServerUrl = process.env.VETTA_DESKTOP_DEV_URL;
const petPreloadPath = join(resDir, "preload/pet.js");

let petWindow: BrowserWindow | null = null;
let petConfig: PetConfig = DEFAULT_PET_CONFIG;

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
	}
	params.set("autoMode", String(config.autoMode));
	if (config.defaultActionId) {
		params.set("initialAction", config.defaultActionId);
	}
	return params.toString();
}

function getPetEntryUrl(query: string): string {
	if (devServerUrl) {
		return query.length > 0 ? `${devServerUrl}/pet.html?${query}` : `${devServerUrl}/pet.html`;
	}
	const petEntryUrl = pathToFileURL(join(resDir, "renderer/pet.html"));
	petEntryUrl.search = query;
	return petEntryUrl.toString();
}

function loadPetEntry(win: BrowserWindow, log = getAppLogger("pet-window")): void {
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
	getAppLogger("pet-window").info("command sent", command);
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
		getAppLogger("pet-window").info("startup skipped", petConfig);
		return null;
	}
	return createPetWindow();
}

export function createPetWindow(): BrowserWindow {
	const log = getAppLogger("pet-window");
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

	loadPetEntry(petWindow, log);
	return petWindow;
}

export function showPetWindow(): BrowserWindow {
	const win = petWindow && !petWindow.isDestroyed() ? petWindow : createPetWindow();
	if (!win.isVisible()) {
		win.showInactive();
	}
	getAppLogger("pet-window").info("show requested", {
		isVisible: win.isVisible(),
		bounds: win.getBounds(),
	});
	return win;
}

export function applyPetConfig(config: PetConfig): void {
	petConfig = normalizePetConfig(config);
	const log = getAppLogger("pet-window");

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
		win.setBounds({
			x: bounds.x + bounds.width - petConfig.size,
			y: bounds.y + bounds.height - petConfig.size,
			width: petConfig.size,
			height: petConfig.size,
		});
	}
	if (!win.isVisible()) {
		win.showInactive();
	}
	sendPetCommand(win, { type: "set-auto-mode", enabled: petConfig.autoMode });
	if (!petConfig.autoMode && petConfig.defaultActionId) {
		sendPetCommand(win, { type: "set-action", actionId: petConfig.defaultActionId });
	}
	log.info("config applied", {
		petConfig,
		isVisible: win.isVisible(),
		bounds: win.getBounds(),
	});
}
