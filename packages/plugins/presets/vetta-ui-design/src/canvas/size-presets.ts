import type { VetdFrameEntry } from "../vetd/manifest-types";

/**
 * Frame 的预设尺寸。像素一律是设计稿用的 CSS 像素（设备的逻辑分辨率 / 点数），不是物理像素：
 * 画布里的 frame 就是按 CSS 像素渲染的，iPhone 17 是 393 × 852，而不是 1179 × 2556。
 * 纸张按 96dpi 换算（A4 = 794 × 1123），这是浏览器打印 A4 时的页面尺寸。
 */
export type SizeCategoryId = "phone" | "desktop" | "watch" | "paper" | "ipad";

export interface SizePreset {
	id: string;
	/** 产品名，不翻译。 */
	name: string;
	width: number;
	height: number;
}

export interface SizeCategory {
	id: SizeCategoryId;
	presets: readonly SizePreset[];
	/** 有横竖屏之分：预设按竖屏给出，横屏时宽高对调。 */
	orientable?: boolean;
}

export type Orientation = "portrait" | "landscape";

export const SIZE_CATEGORIES: readonly SizeCategory[] = [
	{
		id: "phone",
		presets: [
			{ id: "iphone-17-pro-max", name: "iPhone 17 Pro Max", width: 440, height: 956 },
			{ id: "iphone-17-pro", name: "iPhone 17 Pro", width: 402, height: 874 },
			{ id: "iphone-17", name: "iPhone 17", width: 393, height: 852 },
			{ id: "iphone-air", name: "iPhone Air", width: 420, height: 912 },
			{ id: "iphone-16-plus", name: "iPhone 16 Plus", width: 430, height: 932 },
			{ id: "iphone-14", name: "iPhone 14", width: 390, height: 844 },
			{ id: "iphone-13-mini", name: "iPhone 13 mini", width: 375, height: 812 },
			{ id: "iphone-se", name: "iPhone SE", width: 375, height: 667 },
		],
	},
	{
		id: "desktop",
		presets: [
			{ id: "macbook-air-13", name: 'MacBook Air 13"', width: 1470, height: 956 },
			{ id: "macbook-air-15", name: 'MacBook Air 15"', width: 1710, height: 1107 },
			{ id: "macbook-pro-14", name: 'MacBook Pro 14"', width: 1512, height: 982 },
			{ id: "macbook-pro-16", name: 'MacBook Pro 16"', width: 1728, height: 1117 },
			{ id: "desktop-1080p", name: "Desktop 1080p", width: 1920, height: 1080 },
			{ id: "desktop-1440p", name: "Desktop 1440p", width: 2560, height: 1440 },
			{ id: "desktop-hd", name: "Desktop HD", width: 1440, height: 900 },
			{ id: "laptop-small", name: "Laptop", width: 1280, height: 800 },
		],
	},
	{
		id: "watch",
		presets: [
			{ id: "watch-42", name: "Apple Watch 42mm", width: 187, height: 223 },
			{ id: "watch-46", name: "Apple Watch 46mm", width: 208, height: 248 },
		],
	},
	{
		id: "paper",
		presets: [
			{ id: "a4", name: "A4", width: 794, height: 1123 },
			{ id: "a5", name: "A5", width: 559, height: 794 },
			{ id: "a6", name: "A6", width: 397, height: 559 },
		],
	},
	{
		id: "ipad",
		orientable: true,
		presets: [
			{ id: "ipad-pro-13", name: 'iPad Pro 13"', width: 1032, height: 1376 },
			{ id: "ipad-pro-11", name: 'iPad Pro 11"', width: 834, height: 1210 },
			{ id: "ipad-air-13", name: 'iPad Air 13"', width: 1024, height: 1366 },
			{ id: "ipad-air-11", name: 'iPad Air 11"', width: 820, height: 1180 },
			{ id: "ipad-mini", name: "iPad mini", width: 744, height: 1133 },
		],
	},
];

/** 按方向取出预设的实际宽高（只有 orientable 的分类会对调）。 */
export function presetSize(
	category: SizeCategory,
	preset: SizePreset,
	orientation: Orientation,
): { width: number; height: number } {
	if (category.orientable && orientation === "landscape") return { width: preset.height, height: preset.width };
	return { width: preset.width, height: preset.height };
}

export function formatSize(size: { width: number; height: number }): string {
	return `${size.width} × ${size.height}`;
}

interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

function overlaps(a: Rect, b: Rect): boolean {
	return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * 新建 frame 的落点：优先放在视口中心；那里已经有 frame 压着，就放到所有 frame 的右边
 * （与自动排布同一个规则：顶边对齐最上面的 frame，隔一个间距）。
 */
export function placeNewFrame(
	size: { width: number; height: number },
	center: { x: number; y: number },
	frames: readonly Pick<VetdFrameEntry, "x" | "y" | "width" | "height">[],
	gap: number,
): { x: number; y: number } {
	const centered = { x: Math.round(center.x - size.width / 2), y: Math.round(center.y - size.height / 2) };
	const rect = { ...centered, ...size };
	if (!frames.some((frame) => overlaps(rect, frame))) return centered;
	const right = Math.max(...frames.map((frame) => frame.x + frame.width));
	const top = Math.min(...frames.map((frame) => frame.y));
	return { x: right + gap, y: top };
}
