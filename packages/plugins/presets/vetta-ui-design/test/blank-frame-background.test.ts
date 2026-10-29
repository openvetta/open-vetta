/**
 * 新画框的底色：用当前色卡的背景色；色卡里没有、或还是脚手架占位灰时用纯白。
 */
import { expect, it } from "vitest";
import { blankFrameBackground, blankFrameSource, DEFAULT_THEME_CSS } from "../src/vetd/scaffold";

const theme = (tokens: string): string => `@theme {\n${tokens}\n}`;

it("uses the palette's background token when the theme declares one", () => {
	expect(blankFrameBackground(theme("--color-background: #0b0b0c;\n--color-surface: #111;"))).toBe("bg-background");
	// background 之外退而求其次，顺序固定。
	expect(blankFrameBackground(theme("--color-surface: #111;\n--color-primary: #f00;"))).toBe("bg-surface");
	expect(blankFrameBackground(theme("--color-bg: #fff;"))).toBe("bg-bg");
});

it("falls back to white when there is no theme, no background token, or only the placeholder palette", () => {
	expect(blankFrameBackground(null)).toBe("bg-white");
	expect(blankFrameBackground("")).toBe("bg-white");
	expect(blankFrameBackground(theme("--color-primary: #f00;"))).toBe("bg-white");
	// 脚手架的占位灰（含 surface）不是用户的配色。
	expect(blankFrameBackground(DEFAULT_THEME_CSS)).toBe("bg-white");
});

it("writes the chosen background into the blank frame source", () => {
	expect(blankFrameSource("新画框", 393, 852)).toContain('className="h-full bg-white"');
	expect(blankFrameSource("新画框", 393, 852, "bg-background")).toContain('className="h-full bg-background"');
});
