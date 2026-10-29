import { describe, expect, it } from "vitest";
import { resolvePhoneDevice } from "../src/interaction/phone-shell";

describe("resolvePhoneDevice", () => {
	it("稿子尺寸对不上任何手机预设：没有设备信息，用 iPhone 17 Pro", () => {
		const device = resolvePhoneDevice({ selectedId: null, home: { width: 375, height: 700 } });
		expect(device).toEqual({ viewport: { width: 402, height: 874 }, radius: 62, kind: "island" });
		expect(resolvePhoneDevice({ selectedId: null, home: null }).viewport).toEqual({ width: 402, height: 874 });
	});

	it("尺寸正好是手机预设：视口不变，没声明圆角取预设的（老稿子不会落到 12px）", () => {
		const device = resolvePhoneDevice({ selectedId: null, home: { width: 390, height: 844 } });
		expect(device).toEqual({ viewport: { width: 390, height: 844 }, radius: 47, kind: "notch" });
	});

	it("稿子自己声明了圆角就用它", () => {
		expect(resolvePhoneDevice({ selectedId: null, home: { width: 393, height: 852, radius: 40 } }).radius).toBe(40);
	});

	it("工具条里选了机型就用所选，Home 键款是直角", () => {
		const device = resolvePhoneDevice({ selectedId: "iphone-se", home: { width: 393, height: 852, radius: 62 } });
		expect(device).toEqual({ viewport: { width: 375, height: 667 }, radius: 0, kind: "home" });
	});
});
