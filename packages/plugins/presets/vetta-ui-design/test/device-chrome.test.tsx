import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { resolveChoice } from "../src/interaction/device-choice";
import { DeviceShell } from "../src/interaction/DeviceShell";
import {
	BARE_EDGES,
	chromeKindOf,
	contentFit,
	isTouchChrome,
	SHELLS,
	shellKindOfCategory,
	shellOuterSize,
} from "../src/interaction/device-shell";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
	document.body.innerHTML = "";
});

describe("chromeKindOf：每个预设分类一种外观", () => {
	const choice = (id: string) => resolveChoice({ id, orientation: "portrait" });

	it("选了预设就是它所属的分类", () => {
		expect(chromeKindOf({ choice: choice("iphone-17"), mode: "mobile", homeCategory: null })).toBe("phone");
		expect(chromeKindOf({ choice: choice("macbook-pro-14"), mode: "desktop", homeCategory: null })).toBe("desktop");
		expect(chromeKindOf({ choice: choice("watch-46"), mode: "other", homeCategory: null })).toBe("watch");
		expect(chromeKindOf({ choice: choice("a4"), mode: "other", homeCategory: null })).toBe("paper");
		const ipad = resolveChoice({ id: "ipad-pro-13", orientation: "landscape" });
		if (ipad) expect(chromeKindOf({ choice: ipad, mode: "other", homeCategory: null })).toBe("ipad");
	});

	it("跟随设计稿：移动端是手机，桌面端是桌面", () => {
		expect(chromeKindOf({ choice: null, mode: "mobile", homeCategory: "desktop" })).toBe("phone");
		expect(chromeKindOf({ choice: null, mode: "desktop", homeCategory: "phone" })).toBe("desktop");
	});

	it("跟随设计稿 + 其他：首页尺寸落在手表 / iPad / 纸张就用它，否则按纸张", () => {
		expect(chromeKindOf({ choice: null, mode: "other", homeCategory: "watch" })).toBe("watch");
		expect(chromeKindOf({ choice: null, mode: "other", homeCategory: "ipad" })).toBe("ipad");
		expect(chromeKindOf({ choice: null, mode: "other", homeCategory: "paper" })).toBe("paper");
		expect(chromeKindOf({ choice: null, mode: "other", homeCategory: null })).toBe("paper");
		expect(chromeKindOf({ choice: null, mode: "other", homeCategory: "phone" })).toBe("paper");
	});

	it("手机、iPad、手表是触摸设备，桌面和纸张不是", () => {
		for (const kind of ["phone", "ipad", "watch"] as const) expect(isTouchChrome(kind)).toBe(true);
		for (const kind of ["desktop", "paper"] as const) expect(isTouchChrome(kind)).toBe(false);
	});
});

describe("裸画面的边框", () => {
	it("桌面端：中性灰 30% 不透明度 + 8px；纸张：1px 极细边框", () => {
		expect(BARE_EDGES.desktop).toEqual({ width: 8, color: "rgba(128, 128, 128, 0.3)" });
		expect(BARE_EDGES.paper.width).toBe(1);
		expect(BARE_EDGES.paper.color).toMatch(/^rgba\(128, 128, 128, /);
	});
});

describe("iPad 和手表的外壳", () => {
	it("预设分类对应机身：iPad、手表有，其余没有（手机另按预设特征分）", () => {
		expect(shellKindOfCategory("ipad")).toBe("ipad");
		expect(shellKindOfCategory("watch")).toBe("watch");
		for (const id of ["phone", "desktop", "paper"] as const) expect(shellKindOfCategory(id)).toBeNull();
	});

	it("iPad 机身按视口加 27px 边；手表机身固定尺寸，页面等比缩进屏幕并居中", () => {
		expect(shellOuterSize("ipad", { width: 834, height: 1194 })).toEqual({ width: 888, height: 1248 });
		expect(shellOuterSize("watch", { width: 208, height: 248 })).toEqual(SHELLS.watch.fixed?.outer);
		const fit = contentFit("watch", { width: 187, height: 223 });
		expect(fit).not.toBeNull();
		const screen = SHELLS.watch.fixed?.screen;
		// 缩放后不超出屏幕，且至少有一边正好撑满。
		expect(187 * (fit?.scale ?? 0)).toBeLessThanOrEqual((screen?.width ?? 0) + 0.001);
		expect(223 * (fit?.scale ?? 0)).toBeLessThanOrEqual((screen?.height ?? 0) + 0.001);
		expect(contentFit("ipad", { width: 834, height: 1194 })).toBeNull();
	});

	it("组件：iPad 用 iPad Pro 机身并按视口定尺寸；手表屏幕固定、页面被缩放", () => {
		const host = document.createElement("div");
		document.body.appendChild(host);
		act(() =>
			createRoot(host).render(
				<DeviceShell kind="ipad" viewport={{ width: 834, height: 1194 }}>
					x
				</DeviceShell>,
			),
		);
		expect(host.querySelector(".device-ipad-pro")).not.toBeNull();
		const screen = host.querySelector(".device-screen") as HTMLElement;
		expect([screen.style.width, screen.style.height]).toEqual(["834px", "1194px"]);

		const watchHost = document.createElement("div");
		document.body.appendChild(watchHost);
		act(() =>
			createRoot(watchHost).render(
				<DeviceShell kind="watch" viewport={{ width: 187, height: 223 }}>
					<i data-testid="page" />
				</DeviceShell>,
			),
		);
		expect(watchHost.querySelector(".device-apple-watch-s8")).not.toBeNull();
		const watchScreen = watchHost.querySelector(".device-screen") as HTMLElement;
		expect([watchScreen.style.width, watchScreen.style.height]).toEqual(["268px", "324px"]);
		const page = watchHost.querySelector("[data-testid=page]")?.parentElement as HTMLElement;
		expect(page.style.transform).toMatch(/^scale\(1\.\d+\)$/);
		expect(page.style.width).toBe("187px");
	});
});
