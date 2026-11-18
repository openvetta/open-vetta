import { describe, expect, it } from "vitest";
import { USER_BUBBLE_PALETTE } from "./user-bubble-appearance";

function rgb(hex: string): number[] {
	return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
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
