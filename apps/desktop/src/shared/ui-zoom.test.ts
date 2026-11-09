import { describe, expect, it } from "vitest";
import { normalizeUiZoomFactor, stepUiZoomFactor, UI_ZOOM_DEFAULT, UI_ZOOM_STEPS } from "./ui-zoom";

describe("normalizeUiZoomFactor", () => {
	it("非数字或非有限数回落默认值", () => {
		for (const bad of [undefined, null, "1.2", Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(normalizeUiZoomFactor(bad)).toBe(UI_ZOOM_DEFAULT);
		}
	});

	it("档位值原样保留", () => {
		for (const step of UI_ZOOM_STEPS) expect(normalizeUiZoomFactor(step)).toBe(step);
	});

	it("越界夹到首尾档，其余吸附到最近一档（旧配置里的任意比例也能落到档上）", () => {
		expect(normalizeUiZoomFactor(0.1)).toBe(0.75);
		expect(normalizeUiZoomFactor(9)).toBe(1.5);
		expect(normalizeUiZoomFactor(1.04)).toBe(1);
		expect(normalizeUiZoomFactor(1.2)).toBe(1.25);
	});
});

describe("stepUiZoomFactor", () => {
	it("按档位逐档移动", () => {
		expect(stepUiZoomFactor(1, 1)).toBe(1.1);
		expect(stepUiZoomFactor(1.1, 1)).toBe(1.25);
		expect(stepUiZoomFactor(1, -1)).toBe(0.9);
	});

	it("到头不越界", () => {
		expect(stepUiZoomFactor(1.5, 1)).toBe(1.5);
		expect(stepUiZoomFactor(0.75, -1)).toBe(0.75);
	});
});
