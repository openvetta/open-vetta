import type { FrameSize, VetdManifest } from "./manifest-types";
import { SIZE_CATEGORIES } from "./size-presets";

/**
 * 交互模式（把设计稿当真实产品来点）下，这份设计按哪一类设备呈现：
 * 手机带机身外壳和触摸手势，桌面和其他都是裸画面。
 *
 * 为什么存进 manifest：品类在 vetd_create 那一刻最清楚，之后只剩尺寸可推，而尺寸会被
 * 用户拉伸、一份设计里也可能混着不同尺寸（同 defaultFrameSize 的处境，见 frame-size.ts）。
 */
export const INTERACTION_MODES = ["mobile", "desktop", "other"] as const;

export type InteractionMode = (typeof INTERACTION_MODES)[number];

export function isInteractionMode(value: unknown): value is InteractionMode {
	return typeof value === "string" && (INTERACTION_MODES as readonly string[]).includes(value);
}

/** 没有对得上的预设时，按宽度粗分：窄的是手机，宽的是桌面，中间（平板、方图）归其他。 */
const MOBILE_MAX_WIDTH = 500;
const DESKTOP_MIN_WIDTH = 900;

/** 由一个画框尺寸推断设备类别：先认预设（横竖屏都认），认不出再按宽度。 */
export function inferInteractionModeFromSize(size: FrameSize): InteractionMode {
	for (const category of SIZE_CATEGORIES) {
		const hit = category.presets.some(
			(preset) =>
				(preset.width === size.width && preset.height === size.height) ||
				(preset.width === size.height && preset.height === size.width),
		);
		if (!hit) continue;
		if (category.id === "phone") return "mobile";
		if (category.id === "desktop") return "desktop";
		return "other";
	}
	if (size.width <= MOBILE_MAX_WIDTH) return "mobile";
	if (size.width >= DESKTOP_MIN_WIDTH) return "desktop";
	return "other";
}

/** 品类 → 设备类别。幻灯片、海报虽然是横竖屏幕比例，但没有「设备」，归其他。 */
const PRODUCT_MODES: Record<string, InteractionMode> = {
	mobile: "mobile",
	desktop: "desktop",
	landing: "desktop",
	slide: "other",
	poster: "other",
};

/**
 * 创建时的设备类别。显式值最优先；其次是品类（它比尺寸可靠：1920x1080 的幻灯片在尺寸上
 * 和桌面屏一模一样）；都没给才看尺寸。
 */
export function resolveInteractionMode(input: {
	interaction?: unknown;
	product?: unknown;
	size: FrameSize;
}): InteractionMode {
	if (isInteractionMode(input.interaction)) return input.interaction;
	if (typeof input.product === "string" && input.product in PRODUCT_MODES) return PRODUCT_MODES[input.product];
	return inferInteractionModeFromSize(input.size);
}

/**
 * 打开交互模式时实际用的设备类别：manifest 里存了就用它；老文档没有，就按首页画框的
 * 尺寸推断一次（只在运行时用，不回写）。连画框都没有时按 defaultFrameSize，再没有就桌面。
 */
export function effectiveInteractionMode(
	manifest: Pick<VetdManifest, "interactionMode" | "defaultFrameSize">,
	homeFrame: FrameSize | null,
): InteractionMode {
	if (manifest.interactionMode) return manifest.interactionMode;
	const size = homeFrame ?? manifest.defaultFrameSize;
	return size ? inferInteractionModeFromSize(size) : "desktop";
}
