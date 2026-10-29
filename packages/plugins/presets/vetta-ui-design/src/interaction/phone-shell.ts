import type { FrameSize } from "../vetd/manifest-types";
import { SIZE_CATEGORIES, type SizePreset } from "../vetd/size-presets";

/**
 * 交互模式里的手机外壳，用 devices.css 画。它只有三种机身，我们的手机预设按特征归并：
 * 灵动岛款 → iPhone 14 Pro，刘海款 → iPhone 14，Home 键款 → iPhone 8。
 * 机身外壳自带灵动岛 / 刘海，所以交互模式下会隐藏设计稿自己的状态栏。
 */
export type PhoneShellKind = "island" | "notch" | "home";

export interface PhoneShellSpec {
	/** 套在 `.device` 上的 devices.css 类名。 */
	className: string;
	/** 屏幕四周的机身厚度（px）：x 左右，y 上下。 */
	padding: { x: number; y: number };
}

export const PHONE_SHELLS: Record<PhoneShellKind, PhoneShellSpec> = {
	island: { className: "device-iphone-14-pro device-black", padding: { x: 19, y: 19 } },
	notch: { className: "device-iphone-14", padding: { x: 19, y: 19 } },
	// Home 键款上下额头更宽，屏幕本身也是直角。
	home: { className: "device-iphone-8 device-spacegray", padding: { x: 22, y: 102 } },
};

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
export function shellOuterSize(kind: PhoneShellKind, viewport: FrameSize): FrameSize {
	const { padding } = PHONE_SHELLS[kind];
	return { width: viewport.width + padding.x * 2, height: viewport.height + padding.y * 2 };
}

/** 稿子没有设备信息（尺寸对不上任何手机预设）时套用的机型。 */
export const DEFAULT_PHONE_PRESET_ID = "iphone-17-pro";

export interface PhoneDevice {
	viewport: FrameSize;
	/** 屏幕圆角（px）。 */
	radius: number;
	kind: PhoneShellKind;
}

/**
 * 移动端交互时实际用哪台设备。
 *
 * 用户在工具条里选了机型就用它。「跟随设计稿」时：尺寸正好是某个手机预设，就是那台
 * （视口不变，圆角取稿子自己声明的，没声明取预设的——老稿子没有圆角字段，落到画布默认的
 * 12px 套在大圆角机身里很难看）；对不上任何预设说明稿子没有设备信息，用 iPhone 17 Pro。
 */
export function resolvePhoneDevice(input: {
	selectedId: string | null;
	home: (FrameSize & { radius?: number }) | null;
}): PhoneDevice {
	const byId = (id: string | null): SizePreset | undefined => PHONE_PRESETS.find((preset) => preset.id === id);
	const selected = byId(input.selectedId);
	if (selected) {
		return { viewport: { width: selected.width, height: selected.height }, radius: selected.radius ?? 0, kind: shellKindOfPreset(selected) };
	}
	const matched = input.home ? matchPhonePreset(input.home) : null;
	if (matched && input.home) {
		return {
			viewport: { width: matched.width, height: matched.height },
			radius: input.home.radius ?? matched.radius ?? 0,
			kind: shellKindOfPreset(matched),
		};
	}
	const fallback = byId(DEFAULT_PHONE_PRESET_ID) ?? PHONE_PRESETS[0];
	return { viewport: { width: fallback.width, height: fallback.height }, radius: fallback.radius ?? 0, kind: shellKindOfPreset(fallback) };
}
