import { describe, expect, it } from "vitest";
import { fitScale, isLightColor, parseCssColor, themeStageBackground, veilColor } from "../src/interaction/stage";

describe("fitScale", () => {
	it("放得下就不缩放，也不放大", () => {
		expect(fitScale({ width: 2000, height: 2000 }, { width: 393, height: 852 })).toBe(1);
	});

	it("放不下时取更紧的那一边，并扣掉边距", () => {
		expect(fitScale({ width: 1000, height: 548 }, { width: 393, height: 1000 }, 24)).toBeCloseTo(0.5, 5);
		expect(fitScale({ width: 748, height: 2000 }, { width: 1400, height: 900 }, 24)).toBeCloseTo(0.5, 5);
	});

	it("面板比边距还小时不出现 0 或负数", () => {
		expect(fitScale({ width: 10, height: 10 }, { width: 400, height: 800 })).toBeGreaterThan(0);
	});
});

describe("夹层颜色", () => {
	it("亮底叠黑，暗底叠白", () => {
		expect(veilColor(parseCssColor("#ffffff"))).toContain("0, 0, 0");
		expect(veilColor(parseCssColor("#111827"))).toContain("255, 255, 255");
	});

	it("解析不出底色时当亮底", () => {
		expect(veilColor(null)).toContain("0, 0, 0");
	});

	it("hex 简写与 rgb() 都认", () => {
		expect(parseCssColor("#fff")).toEqual([255, 255, 255]);
		expect(parseCssColor("rgb(10, 20, 30)")).toEqual([10, 20, 30]);
		expect(isLightColor([250, 245, 235])).toBe(true);
		expect(isLightColor([20, 20, 30])).toBe(false);
	});
});

describe("themeStageBackground", () => {
	it("取色卡里的背景 token", () => {
		const css = "@theme {\n  --color-background: #faf7f2;\n  --color-primary: #f00;\n}";
		expect(themeStageBackground(css)).toBe("#faf7f2");
	});

	it("没有背景 token 或没有色卡：交给宿主背景", () => {
		expect(themeStageBackground("@theme {\n  --color-primary: #f00;\n}")).toBeNull();
		expect(themeStageBackground(null)).toBeNull();
	});
});
