import { ipcMain } from "electron";
import { isPetActionId, normalizePetConfig, type PetConfig } from "../../shared/pet-config.js";
import {
	PET_BEGIN_WINDOW_RESIZE_CHANNEL,
	PET_END_WINDOW_RESIZE_CHANNEL,
	PET_MOVE_WINDOW_BY_CHANNEL,
	PET_RESIZE_BY_WHEEL_CHANNEL,
	PET_RESIZE_VIDEO_BY_WHEEL_CHANNEL,
	PET_SET_MOUSE_PASSTHROUGH_CHANNEL,
	PET_SET_VIDEO_SIZE_CHANNEL,
	PET_SET_WINDOW_SIZE_CHANNEL,
	type PetResizeCorner,
} from "../../shared/pet-ipc.js";
import {
	applyPetConfig,
	beginPetWindowResize,
	endPetWindowResize,
	movePetWindowBy,
	resizePetVideoByWheel,
	resizePetWindowByWheel,
	setPetMousePassthrough,
	setPetVideoSize,
	setPetWindowSize,
	showPetWindow,
} from "../pet-window.js";
import { readDesktopConfig, writeDesktopConfig } from "./fs.js";

const CHANNELS = {
	GET_CONFIG: "vetta:pet:get-config",
	SET_CONFIG: "vetta:pet:set-config",
	SHOW: "vetta:pet:show",
	HIDE: "vetta:pet:hide",
} as const;

const PET_RESIZE_CORNERS = new Set<PetResizeCorner>(["top-left", "top-right", "bottom-left", "bottom-right"]);

function isPetResizeCorner(value: unknown): value is PetResizeCorner {
	return typeof value === "string" && PET_RESIZE_CORNERS.has(value as PetResizeCorner);
}

async function persistPetConfig(patch: Partial<PetConfig>): Promise<PetConfig> {
	const current = await readDesktopConfig();
	const nextPet = normalizePetConfig({ ...current.pet, ...patch });
	await writeDesktopConfig({ ...current, pet: nextPet });
	applyPetConfig(nextPet);
	return nextPet;
}

export function registerPetIpc(): () => void {
	ipcMain.handle(CHANNELS.GET_CONFIG, async (): Promise<PetConfig> => {
		const config = await readDesktopConfig();
		return normalizePetConfig(config.pet);
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

	ipcMain.handle(PET_SET_VIDEO_SIZE_CHANNEL, async (_event, actionId: unknown, size: unknown): Promise<void> => {
		if (!isPetActionId(actionId) || typeof size !== "number") return;
		await setPetVideoSize(actionId, size);
	});

	ipcMain.handle(PET_SET_MOUSE_PASSTHROUGH_CHANNEL, (_event, enabled: unknown): void => {
		if (typeof enabled !== "boolean") return;
		setPetMousePassthrough(enabled);
	});

	return () => {
		ipcMain.removeHandler(CHANNELS.GET_CONFIG);
		ipcMain.removeHandler(CHANNELS.SET_CONFIG);
		ipcMain.removeHandler(CHANNELS.SHOW);
		ipcMain.removeHandler(CHANNELS.HIDE);
		ipcMain.removeHandler(PET_RESIZE_BY_WHEEL_CHANNEL);
		ipcMain.removeHandler(PET_RESIZE_VIDEO_BY_WHEEL_CHANNEL);
		ipcMain.removeHandler(PET_MOVE_WINDOW_BY_CHANNEL);
		ipcMain.removeHandler(PET_BEGIN_WINDOW_RESIZE_CHANNEL);
		ipcMain.removeHandler(PET_SET_WINDOW_SIZE_CHANNEL);
		ipcMain.removeHandler(PET_END_WINDOW_RESIZE_CHANNEL);
		ipcMain.removeHandler(PET_SET_VIDEO_SIZE_CHANNEL);
		ipcMain.removeHandler(PET_SET_MOUSE_PASSTHROUGH_CHANNEL);
	};
}
