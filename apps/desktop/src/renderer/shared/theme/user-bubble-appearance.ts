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
type UserBubbleWeight = (typeof USER_BUBBLE_WEIGHTS)[number];

interface UserBubbleAppearance {
	shape: UserBubbleShape;
	color: UserBubbleColor;
	weight: UserBubbleWeight;
}

const STORAGE_KEY = "vetta-user-bubble-appearance";
const DEFAULT_APPEARANCE: UserBubbleAppearance = { shape: "default", color: "default", weight: "default" };

export function isUserBubbleShape(value: unknown): value is UserBubbleShape {
	return USER_BUBBLE_SHAPES.some((shape) => shape === value);
}

export function isUserBubbleColor(value: unknown): value is UserBubbleColor {
	return typeof value === "string" && Object.hasOwn(USER_BUBBLE_PALETTE, value);
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
				color: "color" in value && isUserBubbleColor(value.color) ? value.color : "default",
				weight: "weight" in value && isUserBubbleWeight(value.weight) ? value.weight : "default",
			};
		}
	} catch {
		// Unavailable storage or malformed preferences fall back to the original appearance.
	}
	return DEFAULT_APPEARANCE;
}

function applyAppearance({ shape, color, weight }: UserBubbleAppearance): void {
	const root = document.documentElement;
	root.dataset.userBubbleShape = shape;
	root.dataset.userBubbleColor = color;
	root.dataset.userBubbleWeight = weight;
	const palette = USER_BUBBLE_PALETTE[color];
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
