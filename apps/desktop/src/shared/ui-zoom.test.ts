import { describe, expect, it } from "vitest";
import { normalizeUiZoomFactor, stepUiZoomFactor, UI_ZOOM_DEFAULT, UI_ZOOM_MAX, UI_ZOOM_MIN } from "./ui-zoom";

describe("normalizeUiZoomFactor", () => {
	it("非数字或非有限数回落默认值", () => {
		for (const bad of [undefined, null, "1.2", Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(normalizeUiZoomFactor(bad)).toBe(UI_ZOOM_DEFAULT);
		}
	});

	it("夹到允许范围", () => {
		expect(normalizeUiZoomFactor(0.1)).toBe(UI_ZOOM_MIN);
		expect(normalizeUiZoomFactor(9)).toBe(UI_ZOOM_MAX);
	});

	it("吸附到 5% 步长，不留浮点尾巴", () => {
		expect(normalizeUiZoomFactor(1.12)).toBe(1.1);
		expect(normalizeUiZoomFactor(1.13)).toBe(1.15);
		expect(normalizeUiZoomFactor(0.1 + 0.2 + 0.5)).toBe(0.8);
	});
});

describe("stepUiZoomFactor", () => {
	it("每次走一个步长，累计不漂移", () => {
		let factor = UI_ZOOM_DEFAULT;
		for (let i = 0; i < 4; i++) factor = stepUiZoomFactor(factor, 1);
		expect(factor).toBe(1.2);
		for (let i = 0; i < 4; i++) factor = stepUiZoomFactor(factor, -1);
		expect(factor).toBe(1);
	});

	it("到边界后不再越界", () => {
		expect(stepUiZoomFactor(UI_ZOOM_MAX, 1)).toBe(UI_ZOOM_MAX);
		expect(stepUiZoomFactor(UI_ZOOM_MIN, -1)).toBe(UI_ZOOM_MIN);
	});
});
