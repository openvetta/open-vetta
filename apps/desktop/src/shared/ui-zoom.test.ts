import { describe, expect, it } from "vitest";
import {
	formatUiZoomPercent,
	normalizeUiZoomFactor,
	parseTitlebarCenter,
	stepUiZoomFactor,
	trafficLightPositionFor,
	UI_ZOOM_DEFAULT,
	UI_ZOOM_STEPS,
	uiZoomNeedsCorrection,
} from "./ui-zoom";

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

describe("trafficLightPositionFor", () => {
	it("圆心落在实测中线上：顶边比中线少 9px，其它档位按中线 × 比例换算", () => {
		expect(trafficLightPositionFor(28, 1)).toEqual({ x: 16, y: 19 });
		expect(trafficLightPositionFor(28, 0.75)).toEqual({ x: 16, y: 12 });
		expect(trafficLightPositionFor(28, 1.5)).toEqual({ x: 16, y: 33 });
	});

	it("页头中线变了，红绿灯跟着变，不依赖任何写死的页头数字", () => {
		expect(trafficLightPositionFor(30, 1)).toEqual({ x: 16, y: 21 });
	});
});

describe("parseTitlebarCenter", () => {
	it("只接受合理范围内的有限数", () => {
		expect(parseTitlebarCenter(28)).toBe(28);
		for (const bad of [undefined, "28", Number.NaN, -1, 9999, Number.POSITIVE_INFINITY]) {
			expect(parseTitlebarCenter(bad)).toBeUndefined();
		}
	});
});

describe("uiZoomNeedsCorrection", () => {
	it("实测与档位一致（含 Chromium 的浮点误差）时不纠正", () => {
		expect(uiZoomNeedsCorrection(1.1, 1.1)).toBe(false);
		expect(uiZoomNeedsCorrection(1.1000000001, 1.1)).toBe(false);
	});

	it("实测偏离档位就纠正：显示 110% 实际却是 100% 或 90%", () => {
		expect(uiZoomNeedsCorrection(1, 1.1)).toBe(true);
		expect(uiZoomNeedsCorrection(0.9, 1.1)).toBe(true);
	});

	it("取不到有效实测值时不动，避免乱写", () => {
		for (const bad of [undefined, null, Number.NaN, 0, -1, "1.1"]) {
			expect(uiZoomNeedsCorrection(bad, 1.1)).toBe(false);
		}
	});
});

describe("formatUiZoomPercent", () => {
	it("按档位输出百分比，浮点误差不外露", () => {
		expect(formatUiZoomPercent(1.1)).toBe("110%");
		expect(formatUiZoomPercent(0.75)).toBe("75%");
		expect(formatUiZoomPercent(1.5000001)).toBe("150%");
	});
});
