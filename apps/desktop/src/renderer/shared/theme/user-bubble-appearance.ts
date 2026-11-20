import { atom } from "jotai";

export const USER_BUBBLE_SHAPES = ["default", "chat"] as const;
export const USER_BUBBLE_WEIGHTS = ["default", "medium", "semibold"] as const;
export const USER_BUBBLE_PALETTE = {
	default: null,
	blue: { background: "#065dca", foreground: "#ffffff" },
	yellow: { background: "#f5cf57", foreground: "#241700" },
	green: { background: "#14613e", foreground: "#ffffff" },
	purple: { background: "#6335a5", foreground: "#ffffff" },
	pink: { background: "#f3b6cf", foreground: "#351427" },
} as const;

export type UserBubbleShape = (typeof USER_BUBBLE_SHAPES)[number];
export type UserBubbleColor = keyof typeof USER_BUBBLE_PALETTE;
/** 用户自选的颜色，一律存成 `#rrggbb`。 */
export type UserBubbleCustomColor = `#${string}`;
/** 气泡配色：命名预设、自选十六进制，或 `default`（跟随主题）。 */
export type UserBubbleColorChoice = UserBubbleColor | UserBubbleCustomColor;
type UserBubbleWeight = (typeof USER_BUBBLE_WEIGHTS)[number];

interface UserBubbleAppearance {
	shape: UserBubbleShape;
	color: UserBubbleColorChoice;
	weight: UserBubbleWeight;
}

const STORAGE_KEY = "vetta-user-bubble-appearance";
const DEFAULT_APPEARANCE: UserBubbleAppearance = { shape: "default", color: "default", weight: "default" };

export function isUserBubbleShape(value: unknown): value is UserBubbleShape {
	return USER_BUBBLE_SHAPES.some((shape) => shape === value);
}

const CUSTOM_COLOR_PATTERN = /^#[0-9a-f]{6}$/u;

/** 自选色只接受规范化后的 `#rrggbb`；别的写法一律当脏数据回落默认。 */
export function isUserBubbleCustomColor(value: unknown): value is UserBubbleCustomColor {
	return typeof value === "string" && CUSTOM_COLOR_PATTERN.test(value.toLowerCase());
}

export function isUserBubbleColor(value: unknown): value is UserBubbleColor {
	return typeof value === "string" && Object.hasOwn(USER_BUBBLE_PALETTE, value);
}

export function isUserBubbleColorChoice(value: unknown): value is UserBubbleColorChoice {
	return isUserBubbleColor(value) || isUserBubbleCustomColor(value);
}

export function isUserBubbleWeight(value: unknown): value is UserBubbleWeight {
	return USER_BUBBLE_WEIGHTS.some((weight) => weight === value);
}

function readAppearance(): UserBubbleAppearance {
	try {
		const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
		if (typeof value === "object" && value !== null) {
			return {
				shape: "shape" in value && isUserBubbleShape(value.shape) ? value.shape : "default",
				color: "color" in value && isUserBubbleColorChoice(value.color) ? value.color : "default",
				weight: "weight" in value && isUserBubbleWeight(value.weight) ? value.weight : "default",
			};
		}
	} catch {
		// Unavailable storage or malformed preferences fall back to the original appearance.
	}
	return DEFAULT_APPEARANCE;
}

/** 气泡上文字的三种候选色：深墨、纯白，以及深墨够不着 AA 时的纯黑兜底。 */
const BUBBLE_INK = "#1d1d1f";
const BUBBLE_PAPER = "#ffffff";
const BUBBLE_BLACK = "#000000";
/** WCAG AA 对正常字号正文要求的对比度。 */
const AA_CONTRAST = 4.5;

/** 相对亮度（WCAG 2.x）。 */
function luminance(hex: string): number {
	const rgb = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
	const [r, g, b] = rgb.map((channel) =>
		channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
	) as [number, number, number];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
	const [lighter, darker] = [luminance(a), luminance(b)].sort((left, right) => right - left) as [number, number];
	return (lighter + 0.05) / (darker + 0.05);
}

/**
 * 自选色的气泡文字色：在深墨与白之间取对比度更高的那个，够不到 AA 时退到纯黑。
 * 用固定阈值判断明暗会在中灰地带把对比度压到 4.5 以下，所以这里直接比对比度。
 */
export function contrastBubbleForeground(background: UserBubbleCustomColor): string {
	const ink = contrastRatio(background, BUBBLE_INK);
	const paper = contrastRatio(background, BUBBLE_PAPER);
	const best = ink >= paper ? BUBBLE_INK : BUBBLE_PAPER;
	if (Math.max(ink, paper) >= AA_CONTRAST) return best;
	return contrastRatio(background, BUBBLE_BLACK) > contrastRatio(background, best) ? BUBBLE_BLACK : best;
}

/** 把配色选择落成实际的前景 / 背景；`default` 返回 null（跟随主题，不写变量）。 */
export function resolveUserBubblePalette(
	color: UserBubbleColorChoice,
): { background: string; foreground: string } | null {
	if (isUserBubbleCustomColor(color)) {
		return { background: color, foreground: contrastBubbleForeground(color) };
	}
	return isUserBubbleColor(color) ? USER_BUBBLE_PALETTE[color] : null;
}

function applyAppearance({ shape, color, weight }: UserBubbleAppearance): void {
	const root = document.documentElement;
	root.dataset.userBubbleShape = shape;
	root.dataset.userBubbleColor = color;
	root.dataset.userBubbleWeight = weight;
	const palette = resolveUserBubblePalette(color);
	if (palette) {
		root.style.setProperty("--user-bubble-bg", palette.background);
		root.style.setProperty("--user-bubble-fg", palette.foreground);
	} else {
		root.style.removeProperty("--user-bubble-bg");
		root.style.removeProperty("--user-bubble-fg");
	}
}

export function applyInitialUserBubbleAppearance(): void {
	applyAppearance(readAppearance());
}

const initialAppearanceAtom = atom(() => readAppearance());
const appearanceOverrideAtom = atom<UserBubbleAppearance | null>(null);
export const userBubbleAppearanceAtom = atom(
	(get) => get(appearanceOverrideAtom) ?? get(initialAppearanceAtom),
	(get, set, change: Partial<UserBubbleAppearance>) => {
		const next = { ...(get(appearanceOverrideAtom) ?? get(initialAppearanceAtom)), ...change };
		set(appearanceOverrideAtom, next);
		applyAppearance(next);
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		} catch {
			// The current window still reflects the preference when storage is unavailable.
		}
	},
);
