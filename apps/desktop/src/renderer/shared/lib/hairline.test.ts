import { describe, expect, it } from "vitest";
import { hairlineWidth } from "./hairline";

describe("hairlineWidth", () => {
	it("is exactly 1px at integer scale factors", () => {
		expect(hairlineWidth(1)).toBe(1);
		expect(hairlineWidth(2)).toBe(0.5 * 2);
	});

	it("shrinks to the device-pixel-snapped border width at fractional zoom", () => {
		// 2x 屏放大到 110%：dpr 2.2，边框取整为 2 个设备像素 → 2 / 2.2 css px。
		expect(hairlineWidth(2.2)).toBeCloseTo(2 / 2.2, 6);
		// 1x 屏放大到 125%：dpr 1.25，取整为 1 个设备像素。
		expect(hairlineWidth(1.25)).toBeCloseTo(0.8, 6);
	});

	it("never goes below one device pixel and ignores bad input", () => {
		expect(hairlineWidth(0.8)).toBeCloseTo(1 / 0.8, 6);
		expect(hairlineWidth(0)).toBe(1);
		expect(hairlineWidth(Number.NaN)).toBe(1);
	});
});
