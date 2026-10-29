import type { FrameSize } from "../vetd/manifest-types";
import { SIZE_CATEGORIES, type SizePreset } from "../vetd/size-presets";
import type { StatusBarSetting } from "../vetd/status-bar";

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

/**
 * 当前该套哪种机身。对得上预设就按预设；对不上（自定义尺寸）时看设计声明的状态栏：
 * 声明了刘海就是刘海款，其余默认灵动岛。
 */
export function phoneShellKind(size: FrameSize, statusBar: StatusBarSetting | undefined): PhoneShellKind {
	const preset = matchPhonePreset(size);
	if (preset) return shellKindOfPreset(preset);
	return statusBar === "notch" ? "notch" : "island";
}

/** 外壳连屏幕的整体尺寸。 */
export function shellOuterSize(kind: PhoneShellKind, viewport: FrameSize): FrameSize {
	const { padding } = PHONE_SHELLS[kind];
	return { width: viewport.width + padding.x * 2, height: viewport.height + padding.y * 2 };
}
