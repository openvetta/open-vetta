import { PET_ACTIONS, type PetActionId } from "./pet-actions.js";

export interface PetConfig {
	enabled: boolean;
	autoMode: boolean;
	alwaysOnTop: boolean;
	size: number;
	debugFrame: boolean;
	defaultActionId?: PetActionId;
	videoSizeByAction: PetVideoSizeByAction;
}

export type PetVideoSizeByAction = Record<PetActionId, number>;

export const PET_SIZE_OPTIONS = [
	{ value: 180, label: "小" },
	{ value: 220, label: "中" },
	{ value: 280, label: "大" },
] as const;

export const PET_SIZE_MIN = 80;
export const PET_SIZE_MAX = 600;
export const PET_SIZE_STEP = 20;
export const PET_VIDEO_SIZE_MIN = 40;
export const PET_VIDEO_SIZE_MAX = 600;
export const PET_VIDEO_SIZE_STEP = 10;
export const DEFAULT_PET_VIDEO_SIZE = 220;

export const DEFAULT_PET_CONFIG: PetConfig = {
	enabled: true,
	autoMode: true,
	alwaysOnTop: true,
	size: 220,
	debugFrame: false,
	defaultActionId: "typing",
	videoSizeByAction: createDefaultVideoSizeByAction(),
};

const PET_ACTION_IDS = new Set<string>(PET_ACTIONS.map((action) => action.id));

function createDefaultVideoSizeByAction(): PetVideoSizeByAction {
	const sizes = {} as PetVideoSizeByAction;
	for (const action of PET_ACTIONS) {
		sizes[action.id] = DEFAULT_PET_VIDEO_SIZE;
	}
	return sizes;
}

export function normalizePetSize(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_PET_CONFIG.size;
	const size = Math.round(value);
	return Math.min(Math.max(size, PET_SIZE_MIN), PET_SIZE_MAX);
}

export function normalizePetVideoSize(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_PET_VIDEO_SIZE;
	const stepped = Math.round(value / PET_VIDEO_SIZE_STEP) * PET_VIDEO_SIZE_STEP;
	return Math.min(Math.max(stepped, PET_VIDEO_SIZE_MIN), PET_VIDEO_SIZE_MAX);
}

export function normalizePetVideoSizeForWindow(value: unknown, windowSize: number): number {
	const maxSize = Math.max(
		PET_VIDEO_SIZE_MIN,
		Math.floor(normalizePetSize(windowSize) / PET_VIDEO_SIZE_STEP) * PET_VIDEO_SIZE_STEP,
	);
	return Math.min(normalizePetVideoSize(value), maxSize);
}

export function getPetVideoSize(config: PetConfig, actionId: PetActionId): number {
	return config.videoSizeByAction[actionId] ?? DEFAULT_PET_VIDEO_SIZE;
}

function normalizeVideoSizeByAction(value: unknown): PetVideoSizeByAction {
	const sizes = createDefaultVideoSizeByAction();
	if (typeof value !== "object" || value === null) return sizes;

	const rawSizes = value as Record<string, unknown>;
	for (const action of PET_ACTIONS) {
		sizes[action.id] = normalizePetVideoSize(rawSizes[action.id]);
	}
	return sizes;
}

export function isPetActionId(value: unknown): value is PetActionId {
	return typeof value === "string" && PET_ACTION_IDS.has(value);
}

export function normalizePetConfig(value: unknown): PetConfig {
	if (typeof value !== "object" || value === null) {
		return { ...DEFAULT_PET_CONFIG };
	}

	const config = value as Record<string, unknown>;

	return {
		enabled: typeof config.enabled === "boolean" ? config.enabled : DEFAULT_PET_CONFIG.enabled,
		autoMode: typeof config.autoMode === "boolean" ? config.autoMode : DEFAULT_PET_CONFIG.autoMode,
		alwaysOnTop: typeof config.alwaysOnTop === "boolean" ? config.alwaysOnTop : DEFAULT_PET_CONFIG.alwaysOnTop,
		debugFrame: typeof config.debugFrame === "boolean" ? config.debugFrame : DEFAULT_PET_CONFIG.debugFrame,
		size: normalizePetSize(config.size),
		defaultActionId: isPetActionId(config.defaultActionId)
			? config.defaultActionId
			: DEFAULT_PET_CONFIG.defaultActionId,
		videoSizeByAction: normalizeVideoSizeByAction(config.videoSizeByAction),
	};
}
