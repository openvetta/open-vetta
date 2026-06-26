import { existsSync } from "node:fs";
import { join } from "node:path";
import { app, ipcMain } from "electron";
import type { PetDecoration } from "../../preload/api-types/pet.js";
import { isPetActionId, normalizePetConfig, type PetConfig } from "../../shared/pet-config.js";
import {
	PET_BEGIN_WINDOW_RESIZE_CHANNEL,
	PET_END_WINDOW_RESIZE_CHANNEL,
	PET_MOVE_WINDOW_BY_CHANNEL,
	PET_RESIZE_BY_WHEEL_CHANNEL,
	PET_RESIZE_VIDEO_BY_WHEEL_CHANNEL,
	PET_SET_MOUSE_PASSTHROUGH_CHANNEL,
	PET_SET_VIDEO_BASE_SIZE_CHANNEL,
	PET_SET_VIDEO_HITBOX_CHANNEL,
	PET_SET_WINDOW_SIZE_CHANNEL,
	type PetResizeCorner,
	type PetVideoHitbox,
} from "../../shared/pet-ipc.js";
import { MEDIA_PROTOCOL_SCHEME } from "../media-protocol.js";
import { readPetConfig, writePetConfig } from "../pet-config-store.js";
import {
	applyPetConfig,
	beginPetWindowResize,
	endPetWindowResize,
	movePetWindowBy,
	resizePetVideoByWheel,
	resizePetWindowByWheel,
	sendPetCommandToWindow,
	setPetMousePassthrough,
	setPetVideoBaseSize,
	setPetVideoHitbox,
	setPetWindowSize,
	showPetWindow,
} from "../pet-window.js";
import { allowProjectRoot } from "./fs.js";

const CHANNELS = {
	GET_CONFIG: "vetta:pet:get-config",
	SET_CONFIG: "vetta:pet:set-config",
	SHOW: "vetta:pet:show",
	HIDE: "vetta:pet:hide",
	SET_ACTION: "vetta:pet:set-action",
	GET_DECORATIONS: "vetta:pet:get-decorations",
} as const;

const PET_RESIZE_CORNERS = new Set<PetResizeCorner>(["top-left", "top-right", "bottom-left", "bottom-right"]);
const appRoot = app.isPackaged ? app.getAppPath() : process.cwd();
const buildDir = app.isPackaged ? join(process.resourcesPath, "build") : join(appRoot, "build");
const petMediaDir = join(buildDir, "pet");
const PET_DECORATIONS = [
	{ id: "monitor", fileName: "blank_black_computer_monitor.png", label: "显示器" },
	{ id: "santa", fileName: "stoat_christmas_santa_outfit.png", label: "圣诞装" },
	{ id: "business", fileName: "stoat_business_suit_lawyer.png", label: "商务装" },
	{ id: "office", fileName: "stoat_pray_microsoft_office.png", label: "办公祈祷" },
	{ id: "peeking-monitor", fileName: "stoat_peeking_from_monitor.png", label: "探出显示器" },
	{ id: "dragon-boat", fileName: "stoat_dragon_boat_festival.png", label: "端午装饰" },
] as const;

function getPetDecorations(): PetDecoration[] {
	allowProjectRoot(petMediaDir);
	return PET_DECORATIONS.map((decoration) => {
		const path = join(petMediaDir, decoration.fileName);
		return {
			...decoration,
			found: existsSync(path),
			url: `${MEDIA_PROTOCOL_SCHEME}://local/stream?path=${encodeURIComponent(path)}`,
		};
	});
}

function isPetResizeCorner(value: unknown): value is PetResizeCorner {
	return typeof value === "string" && PET_RESIZE_CORNERS.has(value as PetResizeCorner);
}

function isPetVideoHitbox(value: unknown): value is PetVideoHitbox {
	if (typeof value !== "object" || value === null) return false;
	const hitbox = value as Record<string, unknown>;
	return (
		typeof hitbox.x === "number" &&
		Number.isFinite(hitbox.x) &&
		typeof hitbox.y === "number" &&
		Number.isFinite(hitbox.y) &&
		typeof hitbox.width === "number" &&
		Number.isFinite(hitbox.width) &&
		typeof hitbox.height === "number" &&
		Number.isFinite(hitbox.height)
	);
}

async function persistPetConfig(patch: Partial<PetConfig>): Promise<PetConfig> {
	const current = await readPetConfig();
	const nextPet = normalizePetConfig({ ...current, ...patch });
	await writePetConfig(nextPet);
	applyPetConfig(nextPet);
	return nextPet;
}

export function registerPetIpc(): () => void {
	ipcMain.handle(CHANNELS.GET_CONFIG, async (): Promise<PetConfig> => {
		return readPetConfig();
	});

	ipcMain.handle(CHANNELS.SET_CONFIG, async (_event, patch: unknown): Promise<PetConfig> => {
		if (typeof patch !== "object" || patch === null) {
			throw new Error("Invalid pet config");
		}
		return persistPetConfig(patch as Partial<PetConfig>);
	});

	ipcMain.handle(CHANNELS.SHOW, async (): Promise<PetConfig> => {
		const next = await persistPetConfig({ enabled: true });
		showPetWindow();
		return next;
	});

	ipcMain.handle(CHANNELS.HIDE, async (): Promise<PetConfig> => {
		return persistPetConfig({ enabled: false });
	});

	ipcMain.handle(CHANNELS.SET_ACTION, (_event, actionId: unknown): void => {
		if (!isPetActionId(actionId)) return;
		sendPetCommandToWindow({ type: "set-action", actionId, source: "user", holdMs: 10_000 });
	});

	ipcMain.handle(CHANNELS.GET_DECORATIONS, (): PetDecoration[] => {
		return getPetDecorations();
	});

	ipcMain.handle(PET_RESIZE_BY_WHEEL_CHANNEL, async (_event, deltaY: unknown): Promise<void> => {
		if (typeof deltaY !== "number") return;
		await resizePetWindowByWheel(deltaY);
	});

	ipcMain.handle(
		PET_RESIZE_VIDEO_BY_WHEEL_CHANNEL,
		async (_event, actionId: unknown, deltaY: unknown): Promise<void> => {
			if (!isPetActionId(actionId) || typeof deltaY !== "number") return;
			await resizePetVideoByWheel(actionId, deltaY);
		},
	);

	ipcMain.handle(PET_MOVE_WINDOW_BY_CHANNEL, (_event, deltaX: unknown, deltaY: unknown): void => {
		if (typeof deltaX !== "number" || typeof deltaY !== "number") return;
		movePetWindowBy(deltaX, deltaY);
	});

	ipcMain.handle(PET_BEGIN_WINDOW_RESIZE_CHANNEL, (_event, corner: unknown): void => {
		if (!isPetResizeCorner(corner)) return;
		beginPetWindowResize(corner);
	});

	ipcMain.handle(PET_SET_WINDOW_SIZE_CHANNEL, async (_event, size: unknown, corner: unknown): Promise<void> => {
		if (typeof size !== "number") return;
		await setPetWindowSize(size, isPetResizeCorner(corner) ? corner : undefined);
	});

	ipcMain.handle(PET_END_WINDOW_RESIZE_CHANNEL, async (_event, size: unknown): Promise<void> => {
		if (typeof size !== "number") return;
		await endPetWindowResize(size);
	});

	ipcMain.handle(
		PET_SET_VIDEO_BASE_SIZE_CHANNEL,
		async (_event, actionId: unknown, baseSize: unknown): Promise<void> => {
			if (!isPetActionId(actionId) || typeof baseSize !== "number") return;
			await setPetVideoBaseSize(actionId, baseSize);
		},
	);

	ipcMain.handle(PET_SET_MOUSE_PASSTHROUGH_CHANNEL, (_event, enabled: unknown): void => {
		if (typeof enabled !== "boolean") return;
		setPetMousePassthrough(enabled);
	});

	ipcMain.handle(PET_SET_VIDEO_HITBOX_CHANNEL, (_event, hitbox: unknown): void => {
		setPetVideoHitbox(isPetVideoHitbox(hitbox) ? hitbox : undefined);
	});

	return () => {
		ipcMain.removeHandler(CHANNELS.GET_CONFIG);
		ipcMain.removeHandler(CHANNELS.SET_CONFIG);
		ipcMain.removeHandler(CHANNELS.SHOW);
		ipcMain.removeHandler(CHANNELS.HIDE);
		ipcMain.removeHandler(CHANNELS.SET_ACTION);
		ipcMain.removeHandler(CHANNELS.GET_DECORATIONS);
		ipcMain.removeHandler(PET_RESIZE_BY_WHEEL_CHANNEL);
		ipcMain.removeHandler(PET_RESIZE_VIDEO_BY_WHEEL_CHANNEL);
		ipcMain.removeHandler(PET_MOVE_WINDOW_BY_CHANNEL);
		ipcMain.removeHandler(PET_BEGIN_WINDOW_RESIZE_CHANNEL);
		ipcMain.removeHandler(PET_SET_WINDOW_SIZE_CHANNEL);
		ipcMain.removeHandler(PET_END_WINDOW_RESIZE_CHANNEL);
		ipcMain.removeHandler(PET_SET_VIDEO_BASE_SIZE_CHANNEL);
		ipcMain.removeHandler(PET_SET_MOUSE_PASSTHROUGH_CHANNEL);
		ipcMain.removeHandler(PET_SET_VIDEO_HITBOX_CHANNEL);
	};
}
