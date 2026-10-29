import type { FrameSize } from "../vetd/manifest-types";
import type { InteractionMode } from "../vetd/interaction-mode";
import { SIZE_CATEGORIES, type SizeCategoryId, type SizePreset } from "../vetd/size-presets";
import type { ResolvedChoice } from "./device-choice";

/**
 * 交互模式里的设备外壳，用 devices.css 画。库里每种设备只有一种机身，我们的预设按特征归并：
 * - 手机：灵动岛款 → iPhone 14 Pro，刘海款 → iPhone 14，Home 键款 → iPhone 8；
 * - iPad → iPad Pro；手表 → Apple Watch Series 8。
 * 手机外壳自带灵动岛 / 刘海，所以交互模式下会隐藏设计稿状态栏里的挖孔。
 */
export type PhoneShellKind = "island" | "notch" | "home";
export type ShellKind = PhoneShellKind | "ipad" | "watch";

export interface ShellSpec {
	/** 套在 `.device` 上的 devices.css 类名。 */
	className: string;
	/** 屏幕四周的机身厚度（px）：x 左右，y 上下。 */
	padding: { x: number; y: number };
	/** 外壳自己定下的屏幕圆角（px，devices.css 里的值）。外壳的圆角说了算，不套画框的圆角。 */
	screenRadius: number;
	/**
	 * 机身是固定尺寸的（手表）：整台设备和屏幕都按库里的原尺寸画，内容再等比缩进屏幕。
	 * 手表预设只有 187 × 223 左右，要是按视口反推机身，表圈相对屏幕会厚得离谱。
	 */
	fixed?: { outer: FrameSize; screen: FrameSize };
}

export const SHELLS: Record<ShellKind, ShellSpec> = {
	island: { className: "device-iphone-14-pro device-black", padding: { x: 19, y: 19 }, screenRadius: 49 },
	notch: { className: "device-iphone-14", padding: { x: 19, y: 19 }, screenRadius: 49 },
	// Home 键款上下额头更宽，屏幕本身也是直角。
	home: { className: "device-iphone-8 device-spacegray", padding: { x: 22, y: 102 }, screenRadius: 4 },
	ipad: { className: "device-ipad-pro device-spacegray", padding: { x: 27, y: 27 }, screenRadius: 11 },
	watch: {
		className: "device-apple-watch-s8",
		padding: { x: 26, y: 28 },
		screenRadius: 62,
		fixed: { outer: { width: 360, height: 380 }, screen: { width: 268, height: 324 } },
	},
};

/** 旧名：手机外壳的那三种。 */
export const PHONE_SHELLS = SHELLS;

/** 刘海款预设的 id；其余带圆角的当灵动岛款，没有圆角的当 Home 键款。 */
const NOTCH_PRESETS: ReadonlySet<string> = new Set(["iphone-14", "iphone-13-mini"]);

export const PHONE_PRESETS: readonly SizePreset[] = SIZE_CATEGORIES.find((entry) => entry.id === "phone")?.presets ?? [];

export function shellKindOfPreset(preset: SizePreset): PhoneShellKind {
	if (NOTCH_PRESETS.has(preset.id)) return "notch";
	return preset.radius === undefined ? "home" : "island";
}

/** 画框尺寸正好是某个手机预设（竖屏）时返回它。 */
export function matchPhonePreset(size: FrameSize): SizePreset | null {
	return PHONE_PRESETS.find((preset) => preset.width === size.width && preset.height === size.height) ?? null;
}

/** 外壳连屏幕的整体尺寸。 */
export function shellOuterSize(kind: ShellKind, viewport: FrameSize): FrameSize {
	const spec = SHELLS[kind];
	if (spec.fixed) return spec.fixed.outer;
	return { width: viewport.width + spec.padding.x * 2, height: viewport.height + spec.padding.y * 2 };
}

/** 页面（viewport）等比缩进固定尺寸屏幕里的缩放比；只有机身固定的设备（手表）才缩。 */
export function contentFit(kind: ShellKind, viewport: FrameSize): { scale: number; offset: FrameSize } | null {
	const fixed = SHELLS[kind].fixed;
	if (!fixed) return null;
	const scale = Math.min(fixed.screen.width / viewport.width, fixed.screen.height / viewport.height);
	return {
		scale,
		offset: {
			width: (fixed.screen.width - viewport.width * scale) / 2,
			height: (fixed.screen.height - viewport.height * scale) / 2,
		},
	};
}

/** 稿子没有设备信息（尺寸对不上任何手机预设）时套用的机型。 */
export const DEFAULT_PHONE_PRESET_ID = "iphone-17-pro";

export interface PhoneDevice {
	viewport: FrameSize;
	/** 屏幕圆角（px）：外壳自己的，不是画框或预设的。 */
	radius: number;
	kind: PhoneShellKind;
}

/**
 * 移动端交互时实际用哪台设备。
 *
 * 圆角一律用外壳自己的，不套画框或预设的：外壳已经确定了屏幕和机身的圆角，再叠一层
 * 画框圆角只会和它对不上。
 *
 * 用户在工具条里选了机型就用它。「跟随设计稿」时：尺寸正好是某个手机预设，就是那台
 * （视口不变）；对不上任何预设说明稿子没有设备信息，用 iPhone 17 Pro。
 */
function deviceOf(preset: SizePreset, viewport: FrameSize): PhoneDevice {
	const kind = shellKindOfPreset(preset);
	return { viewport, radius: SHELLS[kind].screenRadius, kind };
}

export function resolvePhoneDevice(input: {
	selectedId: string | null;
	home: (FrameSize & { radius?: number }) | null;
}): PhoneDevice {
	const byId = (id: string | null): SizePreset | undefined => PHONE_PRESETS.find((preset) => preset.id === id);
	const selected = byId(input.selectedId);
	if (selected) {
		return deviceOf(selected, { width: selected.width, height: selected.height });
	}
	const matched = input.home ? matchPhonePreset(input.home) : null;
	if (matched && input.home) {
		return deviceOf(matched, { width: matched.width, height: matched.height });
	}
	const fallback = byId(DEFAULT_PHONE_PRESET_ID) ?? PHONE_PRESETS[0];
	return deviceOf(fallback, { width: fallback.width, height: fallback.height });
}

/**
 * 交互视图里设备的外观类别。和预设分类同一套（Phone / Desktop / Watch / 纸张 / iPad）：
 * 手机、iPad、手表套机身；桌面是 8px 的灰边框；纸张是 1px 的细边框。
 */
export type ChromeKind = "phone" | "desktop" | "watch" | "ipad" | "paper";

/** 手机 / iPad / 手表是触摸设备：鼠标变成圆点，按住拖动滚动。 */
export function isTouchChrome(kind: ChromeKind): boolean {
	return kind === "phone" || kind === "ipad" || kind === "watch";
}

/**
 * 当前是哪一类外观。选了预设就是它所属的分类；「跟随设计稿」按设备类型：移动端 → 手机，
 * 桌面端 → 桌面，其他 → 看首页尺寸正好落在手表 / iPad / 纸张的哪个预设里，对不上按纸张处理。
 */
export function chromeKindOf(input: {
	choice: ResolvedChoice | null;
	mode: InteractionMode;
	homeCategory: SizeCategoryId | null;
}): ChromeKind {
	if (input.choice) return input.choice.category.id === "phone" ? "phone" : input.choice.category.id;
	if (input.mode === "mobile") return "phone";
	if (input.mode === "desktop") return "desktop";
	const home = input.homeCategory;
	return home === "watch" || home === "ipad" || home === "paper" ? home : "paper";
}

/** 没有机身的外观（桌面 / 纸张）的边框：中性灰，不随底色变。 */
export const BARE_EDGES: Record<"desktop" | "paper", { width: number; color: string }> = {
	desktop: { width: 8, color: "rgba(128, 128, 128, 0.3)" },
	paper: { width: 1, color: "rgba(128, 128, 128, 0.45)" },
};

/** 预设分类对应的机身（手机另按预设特征分，见 shellKindOfPreset）。 */
export function shellKindOfCategory(id: SizeCategoryId): ShellKind | null {
	if (id === "ipad") return "ipad";
	if (id === "watch") return "watch";
	return null;
}
