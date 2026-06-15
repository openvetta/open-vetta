/** 命名机型预设表：把「选型号」映射到 react-device-mockup 的形态 + 逻辑分辨率。 */

export type DeviceFrame =
	| { component: "iphone"; screenType: "legacy" | "notch" | "island" }
	| { component: "ipad"; screenType: "legacy" | "modern" }
	| { component: "android" }
	| { component: "android-tab" };

export interface DevicePreset {
	id: string;
	label: string;
	group: "iPhone" | "Android" | "平板";
	frame: DeviceFrame;
	/** 竖屏逻辑分辨率（CSS px），作为设备屏幕渲染宽度。 */
	width: number;
	os: "ios" | "android";
	/** 自绘仿真状态栏高度（屏幕逻辑 px）。 */
	statusBarHeight: number;
}

export const DEVICE_PRESETS: DevicePreset[] = [
	{
		id: "iphone-15-pro",
		label: "iPhone 15 Pro",
		group: "iPhone",
		frame: { component: "iphone", screenType: "island" },
		width: 393,
		os: "ios",
		statusBarHeight: 54,
	},
	{
		id: "iphone-14",
		label: "iPhone 14",
		group: "iPhone",
		frame: { component: "iphone", screenType: "notch" },
		width: 390,
		os: "ios",
		statusBarHeight: 47,
	},
	{
		id: "iphone-se",
		label: "iPhone SE",
		group: "iPhone",
		frame: { component: "iphone", screenType: "legacy" },
		width: 375,
		os: "ios",
		statusBarHeight: 20,
	},
	{
		id: "pixel-8",
		label: "Pixel 8",
		group: "Android",
		frame: { component: "android" },
		width: 412,
		os: "android",
		statusBarHeight: 28,
	},
	{
		id: "galaxy-s24",
		label: "Galaxy S24",
		group: "Android",
		frame: { component: "android" },
		width: 360,
		os: "android",
		statusBarHeight: 28,
	},
	{
		id: "ipad-pro-11",
		label: "iPad Pro 11",
		group: "平板",
		frame: { component: "ipad", screenType: "modern" },
		width: 834,
		os: "ios",
		statusBarHeight: 24,
	},
	{
		id: "ipad-97",
		label: "iPad 9.7",
		group: "平板",
		frame: { component: "ipad", screenType: "legacy" },
		width: 768,
		os: "ios",
		statusBarHeight: 20,
	},
	{
		id: "android-tab",
		label: "Android 平板",
		group: "平板",
		frame: { component: "android-tab" },
		width: 800,
		os: "android",
		statusBarHeight: 28,
	},
];

export const DEFAULT_DEVICE_ID = "iphone-15-pro";

export function findDevice(id: string | null): DevicePreset {
	return DEVICE_PRESETS.find((d) => d.id === id) ?? DEVICE_PRESETS[0];
}
