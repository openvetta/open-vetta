import { PET_ACTIONS, type PetActionId } from "./pet-actions.js";

export interface PetConfig {
	enabled: boolean;
	autoMode: boolean;
	alwaysOnTop: boolean;
	size: number;
	defaultActionId?: PetActionId;
}

export const PET_SIZE_OPTIONS = [
	{ value: 180, label: "小" },
	{ value: 220, label: "中" },
	{ value: 280, label: "大" },
] as const;

export const DEFAULT_PET_CONFIG: PetConfig = {
	enabled: true,
	autoMode: true,
	alwaysOnTop: true,
	size: 220,
	defaultActionId: "typing",
};

const PET_ACTION_IDS = new Set<string>(PET_ACTIONS.map((action) => action.id));
const PET_SIZES: readonly number[] = PET_SIZE_OPTIONS.map((option) => option.value);

export function isPetActionId(value: unknown): value is PetActionId {
	return typeof value === "string" && PET_ACTION_IDS.has(value);
}

export function normalizePetConfig(value: unknown): PetConfig {
	if (typeof value !== "object" || value === null) {
		return { ...DEFAULT_PET_CONFIG };
	}

	const config = value as Record<string, unknown>;
	const size =
		typeof config.size === "number" && PET_SIZES.includes(config.size) ? config.size : DEFAULT_PET_CONFIG.size;

	return {
		enabled: typeof config.enabled === "boolean" ? config.enabled : DEFAULT_PET_CONFIG.enabled,
		autoMode: typeof config.autoMode === "boolean" ? config.autoMode : DEFAULT_PET_CONFIG.autoMode,
		alwaysOnTop: typeof config.alwaysOnTop === "boolean" ? config.alwaysOnTop : DEFAULT_PET_CONFIG.alwaysOnTop,
		size,
		defaultActionId: isPetActionId(config.defaultActionId)
			? config.defaultActionId
			: DEFAULT_PET_CONFIG.defaultActionId,
	};
}
