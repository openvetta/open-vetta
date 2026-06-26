import { PET_ACTIONS, type PetActionId } from "./pet-actions.js";

export interface PetConfig {
	enabled: boolean;
	autoMode: boolean;
	alwaysOnTop: boolean;
	size: number;
	debugFrame: boolean;
	defaultActionId?: PetActionId;
	videoScale: number;
	videoBaseSizeByAction: PetVideoBaseSizeByAction;
}

export type PetVideoBaseSizeByAction = Record<PetActionId, number>;

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
export const PET_VIDEO_SCALE_MIN = 0.4;
export const PET_VIDEO_SCALE_MAX = 2.5;
export const PET_VIDEO_SCALE_STEP = 0.01;
export const DEFAULT_PET_VIDEO_SCALE = 1;

export const DEFAULT_PET_CONFIG: PetConfig = {
	enabled: false,
	autoMode: true,
	alwaysOnTop: true,
	size: 220,
	debugFrame: false,
	defaultActionId: "stoat_spin_color_hula_hoop",
	videoScale: DEFAULT_PET_VIDEO_SCALE,
	videoBaseSizeByAction: createDefaultVideoBaseSizeByAction(),
};

const PET_ACTION_IDS = new Set<string>(PET_ACTIONS.map((action) => action.id));
const LEGACY_PET_ACTION_ID_MAP: Record<string, PetActionId> = {
	sleep: "stoat_sleep_lie_on_cushion",
	workout: "stoat_stand_lift_barbell_one_hand_fast",
	typing: "stoat_work_laptop_typing_desk_cushion",
	music: "stoat_listen_music_headphones_nod",
	hula: "stoat_spin_color_hula_hoop",
	"jump-rope": "stoat_skip_rope_jump",
	tea: "stoat_sit_cushion_drink_tea_slow",
};

function createDefaultVideoBaseSizeByAction(): PetVideoBaseSizeByAction {
	const sizes = {} as PetVideoBaseSizeByAction;
	for (const action of PET_ACTIONS) {
		sizes[action.id] = normalizePetVideoSize(action.videoBaseSize);
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

export function normalizePetVideoScale(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_PET_VIDEO_SCALE;
	const stepped = Math.round(value / PET_VIDEO_SCALE_STEP) * PET_VIDEO_SCALE_STEP;
	return Math.min(Math.max(stepped, PET_VIDEO_SCALE_MIN), PET_VIDEO_SCALE_MAX);
}

export function getPetVideoBaseSize(config: PetConfig, actionId: PetActionId): number {
	return config.videoBaseSizeByAction[actionId] ?? DEFAULT_PET_VIDEO_SIZE;
}

export function getPetScaledVideoSize(config: PetConfig, actionId: PetActionId): number {
	return normalizePetVideoSize(getPetVideoBaseSize(config, actionId) * config.videoScale);
}

export function getPetScaledVideoSizeForWindow(config: PetConfig, actionId: PetActionId, windowSize: number): number {
	return normalizePetVideoSizeForWindow(getPetScaledVideoSize(config, actionId), windowSize);
}

export function getPetVideoScaleForSize(config: PetConfig, actionId: PetActionId, size: number): number {
	const baseSize = getPetVideoBaseSize(config, actionId);
	return normalizePetVideoScale(normalizePetVideoSize(size) / baseSize);
}

function normalizeVideoBaseSizeByAction(value: unknown): PetVideoBaseSizeByAction {
	const sizes = createDefaultVideoBaseSizeByAction();
	if (typeof value !== "object" || value === null) return sizes;

	const rawSizes = value as Record<string, unknown>;
	for (const action of PET_ACTIONS) {
		const legacyId = Object.entries(LEGACY_PET_ACTION_ID_MAP).find(([, nextId]) => nextId === action.id)?.[0];
		sizes[action.id] = normalizePetVideoSize(rawSizes[action.id] ?? (legacyId ? rawSizes[legacyId] : undefined));
	}
	return sizes;
}

export function isPetActionId(value: unknown): value is PetActionId {
	return typeof value === "string" && PET_ACTION_IDS.has(value);
}

function normalizePetActionId(value: unknown): PetActionId | undefined {
	if (isPetActionId(value)) return value;
	if (typeof value !== "string") return undefined;
	return LEGACY_PET_ACTION_ID_MAP[value];
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
		videoScale: normalizePetVideoScale(config.videoScale),
		defaultActionId: normalizePetActionId(config.defaultActionId) ?? DEFAULT_PET_CONFIG.defaultActionId,
		videoBaseSizeByAction: normalizeVideoBaseSizeByAction(config.videoBaseSizeByAction),
	};
}
