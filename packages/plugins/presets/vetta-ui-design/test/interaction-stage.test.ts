import { describe, expect, it } from "vitest";
import { fitScale } from "../src/interaction/stage";

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

describe("toolbarLevel", () => {
	it("还没量到宽度（0）按最宽处理，免得首帧闪一下", async () => {
		const { toolbarLevel } = await import("../src/interaction/stage");
		expect(toolbarLevel(0)).toEqual({ iconOnly: false, hideRoute: false });
	});

	it("逐级收：先把设备 / 浏览器打开收成图标，更窄才收起路由，且每一档都不换行", async () => {
		const { toolbarLevel, ICONS_BELOW, HIDE_ROUTE_BELOW } = await import("../src/interaction/stage");
		expect(HIDE_ROUTE_BELOW).toBeLessThan(ICONS_BELOW);
		expect(toolbarLevel(ICONS_BELOW)).toEqual({ iconOnly: false, hideRoute: false });
		expect(toolbarLevel(ICONS_BELOW - 1)).toEqual({ iconOnly: true, hideRoute: false });
		expect(toolbarLevel(HIDE_ROUTE_BELOW)).toEqual({ iconOnly: true, hideRoute: false });
		expect(toolbarLevel(HIDE_ROUTE_BELOW - 1)).toEqual({ iconOnly: true, hideRoute: true });
	});
});

describe("底部渐变", () => {
	it("主色优先取设计色卡，占位色卡和没写 primary 时让给宿主", async () => {
		const { themeStagePrimary, stageGlow, GLOW_ALPHA, GLOW_ALPHA_LIGHT, GLOW_REACH } = await import("../src/interaction/stage");
		expect(themeStagePrimary("@theme {\n  --color-primary: #0f172a;\n  --color-background: #fff;\n}")).toBe("#0f172a");
		expect(themeStagePrimary("@theme {\n  --color-background: #fff;\n}")).toBeNull();
		expect(themeStagePrimary("/* vetd:placeholder-theme */\n@theme {\n  --color-primary: #888;\n}")).toBeNull();
		expect(themeStagePrimary(null)).toBeNull();
		const glow = stageGlow("#0f172a");
		expect(glow).toContain("to top");
		// 深色浓度不变；浅色另用一档很淡的，两档靠 light-dark() 跟着宿主明暗走。
		expect(glow).toContain("light-dark(");
		expect(glow).toContain(`#0f172a ${GLOW_ALPHA}%`);
		expect(glow).toContain(`#0f172a ${GLOW_ALPHA_LIGHT}%`);
		expect(glow.indexOf(`${GLOW_ALPHA_LIGHT}%`)).toBeLessThan(glow.indexOf(`${GLOW_ALPHA}%`));
		expect(glow).toContain(`transparent ${GLOW_REACH}%`);
		// 低透明度：不能抢设计稿。
		expect(GLOW_ALPHA).toBeLessThanOrEqual(40);
		expect(GLOW_ALPHA).toBe(24);
		expect(GLOW_ALPHA_LIGHT).toBeLessThanOrEqual(10);
	});
});
