import type { VetdFrameEntry } from "./manifest-types";

/**
 * Frame 的预设尺寸——画布底部面板和 agent 的 `vetd_sizes` 工具共用的唯一一份数据。
 * 改尺寸、改圆角只改这里；界面和 agent 都从这里读，不要在别处再抄一份（SKILL.md 里的品类表
 * 和 A4 一行有 test/skill-sizes.test.ts 守着，会在对不上时红）。
 *
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
	/**
	 * 设备屏幕的圆角（CSS 像素）。缺省 = 直角（桌面、纸张）。横竖屏圆角不变。
	 *
	 * 来源：iPhone / iPad 取自社区实测的 `_displayCornerRadius`（kylebshr/ScreenCorners，
	 * Apple 没公布这些数）；iPhone SE 的屏幕是直角；iPad mini 没有实测值，沿用同系列的 18；
	 * MacBook 只有上边两角是圆的，统一圆角表达不了，按直角处理；Apple Watch 没有可靠的公开
	 * 数据，是按屏幕宽度的约 20% 估的，**不是官方值**。
	 */
	radius?: number;
	/** radius 是估算值而不是实测值（目前只有 Apple Watch），agent 引用时要照实说明。 */
	radiusEstimated?: true;
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
			{ id: "iphone-17-pro-max", name: "iPhone 17 Pro Max", width: 440, height: 956, radius: 62 },
			{ id: "iphone-17-pro", name: "iPhone 17 Pro", width: 402, height: 874, radius: 62 },
			{ id: "iphone-17", name: "iPhone 17", width: 393, height: 852, radius: 62 },
			{ id: "iphone-air", name: "iPhone Air", width: 420, height: 912, radius: 62 },
			{ id: "iphone-16-plus", name: "iPhone 16 Plus", width: 430, height: 932, radius: 55 },
			{ id: "iphone-14", name: "iPhone 14", width: 390, height: 844, radius: 47 },
			{ id: "iphone-13-mini", name: "iPhone 13 mini", width: 375, height: 812, radius: 44 },
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
			{ id: "watch-42", name: "Apple Watch 42mm", width: 187, height: 223, radius: 38, radiusEstimated: true },
			{ id: "watch-46", name: "Apple Watch 46mm", width: 208, height: 248, radius: 42, radiusEstimated: true },
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
			{ id: "ipad-pro-13", name: 'iPad Pro 13"', width: 1032, height: 1376, radius: 18 },
			{ id: "ipad-pro-11", name: 'iPad Pro 11"', width: 834, height: 1210, radius: 18 },
			{ id: "ipad-air-13", name: 'iPad Air 13"', width: 1024, height: 1366, radius: 18 },
			{ id: "ipad-air-11", name: 'iPad Air 11"', width: 820, height: 1180, radius: 18 },
			{ id: "ipad-mini", name: "iPad mini", width: 744, height: 1133, radius: 18 },
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

/** 按 id 取预设（含它所在分类）。 */
export function findPreset(id: string): { category: SizeCategory; preset: SizePreset } | null {
	for (const category of SIZE_CATEGORIES) {
		const preset = category.presets.find((entry) => entry.id === id);
		if (preset) return { category, preset };
	}
	return null;
}

/** 预设的像素尺寸（竖屏 / 默认方向）。product-size 等需要引用预设数值的地方用它，不要抄数字。 */
export function presetPixels(id: string): { width: number; height: number } {
	const found = findPreset(id);
	if (!found) throw new Error(`unknown size preset: ${id}`);
	return { width: found.preset.width, height: found.preset.height };
}

/** agent 查到的一条预设。横屏尺寸只在有横竖之分的分类里给。 */
export interface SizePresetInfo {
	id: string;
	name: string;
	category: SizeCategoryId;
	width: number;
	height: number;
	/** 屏幕圆角（px）；0 = 直角。 */
	radius: number;
	/** true = 圆角是估算值，不是实测。 */
	radiusEstimated?: true;
	/** 有横竖屏之分的设备（iPad）：横屏时的宽高，圆角不变。 */
	landscape?: { width: number; height: number };
}

function normalize(text: string): string {
	return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5.]+/g, " ").trim();
}

/** 中文说法 → 分类，让「手机」「平板」「手表」「纸张」这类词也能查到。 */
const CATEGORY_WORDS: Record<string, SizeCategoryId> = {
	手机: "phone",
	平板: "ipad",
	手表: "watch",
	纸张: "paper",
	纸: "paper",
	桌面: "desktop",
	电脑: "desktop",
	笔记本: "desktop",
};

function infoOf(category: SizeCategory, preset: SizePreset): SizePresetInfo {
	return {
		id: preset.id,
		name: preset.name,
		category: category.id,
		width: preset.width,
		height: preset.height,
		radius: preset.radius ?? 0,
		...(preset.radiusEstimated ? { radiusEstimated: true as const } : {}),
		...(category.orientable ? { landscape: { width: preset.height, height: preset.width } } : {}),
	};
}

/**
 * agent 的查询：关键词的每个词都要出现在「名称 + 分类 + id」里（子串匹配，`46` 能命中
 * `46mm`）；没有关键词就列出该分类（或全部）。名称整体相等的排在前面，所以「iPhone 17」
 * 先给 iPhone 17 本身，再给 17 Pro / Pro Max。
 */
export function searchSizePresets(query?: string, categoryId?: SizeCategoryId): SizePresetInfo[] {
	const raw = (query ?? "").trim();
	let words = normalize(raw).split(" ").filter(Boolean);
	let wantedCategory = categoryId;
	for (const [word, mapped] of Object.entries(CATEGORY_WORDS)) {
		if (!raw.includes(word)) continue;
		wantedCategory ??= mapped;
		words = words.filter((entry) => !entry.includes(word));
	}
	const results: { info: SizePresetInfo; exact: boolean }[] = [];
	for (const category of SIZE_CATEGORIES) {
		if (wantedCategory && category.id !== wantedCategory) continue;
		for (const preset of category.presets) {
			const haystack = normalize(`${preset.name} ${category.id} ${preset.id}`);
			if (!words.every((word) => haystack.includes(word))) continue;
			results.push({ info: infoOf(category, preset), exact: normalize(preset.name) === words.join(" ") });
		}
	}
	return results.sort((a, b) => Number(b.exact) - Number(a.exact)).map((entry) => entry.info);
}
