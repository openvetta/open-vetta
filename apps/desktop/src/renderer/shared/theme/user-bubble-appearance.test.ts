import { describe, expect, it } from "vitest";
import {
	contrastBubbleForeground,
	isUserBubbleColorChoice,
	resolveUserBubblePalette,
	USER_BUBBLE_PALETTE,
} from "./user-bubble-appearance";

function rgb(hex: string): number[] {
	return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

function contrast(a: string, b: string): number {
	const [lighter, darker] = [luminance(rgb(a)), luminance(rgb(b))].sort((left, right) => right - left) as [
		number,
		number,
	];
	return (lighter + 0.05) / (darker + 0.05);
}

function luminance(channels: readonly number[]): number {
	const linear = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
	const [red, green, blue] = channels.map(linear);
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

describe("user bubble palette", () => {
	for (const [color, pair] of Object.entries(USER_BUBBLE_PALETTE)) {
		if (!pair) continue;
		it(`${color} meets WCAG AA normal text contrast`, () => {
			const foreground = rgb(pair.foreground);
			const background = rgb(pair.background);
			// Match the strongest foreground tint of interactive Markdown badges on the bubble.
			for (const tint of [0, 0.15]) {
				const tintedBackground = background.map(
					(channel, index) => channel * (1 - tint) + foreground[index] * tint,
				);
				const [lighter, darker] = [luminance(foreground), luminance(tintedBackground)].sort((a, b) => b - a);
				expect((lighter + 0.05) / (darker + 0.05)).toBeGreaterThanOrEqual(4.5);
			}
		});
	}
});

describe("自定义气泡配色", () => {
	it("接受命名预设与 #rrggbb，其他写法一律拒掉", () => {
		expect(isUserBubbleColorChoice("yellow")).toBe(true);
		expect(isUserBubbleColorChoice("default")).toBe(true);
		expect(isUserBubbleColorChoice("#8ec5ff")).toBe(true);
		expect(isUserBubbleColorChoice("#8EC5FF")).toBe(true);
		// 半透明、三位简写、函数写法都不在存储格式里：自选色一律规范成不透明的 #rrggbb。
		expect(isUserBubbleColorChoice("#8ec5ffcc")).toBe(false);
		expect(isUserBubbleColorChoice("rgb(1,2,3)")).toBe(false);
		expect(isUserBubbleColorChoice("javascript:alert(1)")).toBe(false);
		expect(isUserBubbleColorChoice(null)).toBe(false);
	});

	it("自选色的前景在整条色带上都达到 AA 对比度", () => {
		// 覆盖灰阶与各色相的深浅两端：自动选前景一旦退化成「亮底深字 / 暗底白字」的固定阈值，
		// 中灰那几档会掉到 4.5 以下，这里会立刻挂。
		// 存储格式只有 #rrggbb，所以按通道取值铺满色立方（含中灰那一带）。
		const samples: string[] = [];
		for (const r of [0, 51, 102, 153, 204, 255]) {
			for (const g of [0, 51, 102, 153, 204, 255]) {
				for (const b of [0, 51, 102, 153, 204, 255]) {
					samples.push(`#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`);
				}
			}
		}

		for (const sample of samples) {
			const palette = resolveUserBubblePalette(sample as `#${string}`);
			expect(palette?.background, sample).toBe(sample);
			const ratio = contrast(palette?.background ?? "#000000", palette?.foreground ?? "#000000");
			expect(ratio, sample).toBeGreaterThanOrEqual(4.5);
		}
	});

	it("亮底用深色字、暗底用白字", () => {
		expect(contrastBubbleForeground("#8ec5ff")).toBe("#1d1d1f");
		expect(contrastBubbleForeground("#ffffff")).toBe("#1d1d1f");
		expect(contrastBubbleForeground("#065dca")).toBe("#ffffff");
		expect(contrastBubbleForeground("#000000")).toBe("#ffffff");
	});

	it("命名色用自己的前后景色，default 不写变量", () => {
		expect(resolveUserBubblePalette("yellow")).toEqual(USER_BUBBLE_PALETTE.yellow);
		expect(resolveUserBubblePalette("default")).toBeNull();
	});
});
