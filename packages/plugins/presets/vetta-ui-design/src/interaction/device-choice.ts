import type { FrameSize } from "../vetd/manifest-types";
import type { InteractionMode } from "../vetd/interaction-mode";
import {
	findPreset,
	type Orientation,
	presetSize,
	SIZE_CATEGORIES,
	type SizeCategory,
	type SizeCategoryId,
	type SizePreset,
} from "../vetd/size-presets";

/**
 * 交互模式里选的设备：与画布底部尺寸面板同源（size-presets.ts 的 SIZE_CATEGORIES），
 * 预设名和像素尺寸一致。只在本次会话里生效，不写进设计稿。
 */
export interface DeviceChoice {
	id: string;
	/** 只有 orientable 的分类（目前是 iPad）会对调宽高；其余恒为竖屏。 */
	orientation: Orientation;
}

/** 分类 → 交互模式的设备类型：手机带外壳和触摸，桌面是裸画面，其余（手表、纸张、iPad）归其他。 */
export function modeOfCategory(id: SizeCategoryId): InteractionMode {
	if (id === "phone") return "mobile";
	if (id === "desktop") return "desktop";
	return "other";
}

export interface ResolvedChoice {
	category: SizeCategory;
	preset: SizePreset;
	size: FrameSize;
	/** 屏幕圆角（px）；没有就是直角。 */
	radius: number;
	/** 选了它意味着的设备类型。 */
	mode: InteractionMode;
}

/** 预设 id 找不到（预设表改过、旧选择失效）时返回 null，调用方当没选。 */
export function resolveChoice(choice: DeviceChoice | null): ResolvedChoice | null {
	if (!choice) return null;
	const found = findPreset(choice.id);
	if (!found) return null;
	const orientation = found.category.orientable ? choice.orientation : "portrait";
	return {
		category: found.category,
		preset: found.preset,
		size: presetSize(found.category, found.preset, orientation),
		radius: found.preset.radius ?? 0,
		mode: modeOfCategory(found.category.id),
	};
}

/** 浮层默认翻到哪个分类：当前选的那个，否则按设备类型给一个最贴近的。 */
export function defaultCategory(choice: DeviceChoice | null, mode: InteractionMode): SizeCategoryId {
	const resolved = resolveChoice(choice);
	if (resolved) return resolved.category.id;
	if (mode === "desktop") return "desktop";
	return "phone";
}

export const CATEGORY_IDS: readonly SizeCategoryId[] = SIZE_CATEGORIES.map((entry) => entry.id);
