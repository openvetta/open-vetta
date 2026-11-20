import { describe, expect, test } from "vitest";
import { hsvToRgb, hueColor, isSameColor, normalizeColor, parseColor, rgbToHsv, toHex } from "./color";

describe("parseColor", () => {
	test("十六进制：三位、四位、六位、八位都按不透明处理", () => {
		expect(parseColor("#abc")).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
		expect(parseColor("#abcd")).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
		expect(parseColor("#0071E3")).toEqual({ r: 0x00, g: 0x71, b: 0xe3 });
		expect(parseColor("#0071e3ff")).toEqual({ r: 0x00, g: 0x71, b: 0xe3 });
	});

	test("不带 # 的六位写法认，三位不认（避免把普通单词读成颜色）", () => {
		expect(parseColor("34c759")).toEqual({ r: 0x34, g: 0xc7, b: 0x59 });
		expect(parseColor("abc")).toBeNull();
		expect(parseColor("not a color")).toBeNull();
	});

	test("rgb() 支持逗号、空格与百分比写法", () => {
		expect(parseColor("rgb(255, 0, 0)")).toEqual({ r: 255, g: 0, b: 0 });
		expect(parseColor("rgba(0 113 227 / 0.5)")).toEqual({ r: 0, g: 113, b: 227 });
		expect(parseColor("rgb(100% 0% 0%)")).toEqual({ r: 255, g: 0, b: 0 });
	});

	test("hsl() 走色相 / 饱和度 / 亮度换算", () => {
		expect(parseColor("hsl(210, 100%, 50%)")).toEqual({ r: 0, g: 128, b: 255 });
		expect(parseColor("hsla(0deg 100% 50% / .4)")).toEqual({ r: 255, g: 0, b: 0 });
		expect(parseColor("hsl(0, 0%, 100%)")).toEqual({ r: 255, g: 255, b: 255 });
	});

	test("通道越界被夹住，坏输入返回 null", () => {
		expect(parseColor("rgb(300, -20, 0)")).toEqual({ r: 255, g: 0, b: 0 });
		expect(parseColor("rgb(1,2)")).toBeNull();
		expect(parseColor("hsl(x, 10%, 10%)")).toBeNull();
		expect(parseColor("")).toBeNull();
	});
});

describe("normalizeColor / toHex", () => {
	test("统一成小写 #rrggbb", () => {
		expect(normalizeColor("#ABC")).toBe("#aabbcc");
		expect(normalizeColor("rgb(0, 113, 227)")).toBe("#0071e3");
		expect(normalizeColor("nope")).toBeNull();
	});

	test("取整不会漏出小数通道", () => {
		expect(toHex({ r: 12.6, g: 0.4, b: 254.5 })).toBe("#0d00ff");
	});
});

describe("hsv 往返", () => {
	test("纯色在 HSV 里是 s=1 v=1", () => {
		expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 1, v: 1 });
		const blue = rgbToHsv({ r: 0, g: 113, b: 227 });
		expect(blue.h).toBeCloseTo(210, 0);
		expect(blue.s).toBeCloseTo(1, 2);
	});

	test("灰色没有色相，饱和度归零", () => {
		const grey = rgbToHsv({ r: 128, g: 128, b: 128 });
		expect(grey.s).toBe(0);
		expect(hsvToRgb({ h: 0, s: 0, v: grey.v })).toEqual({ r: 128, g: 128, b: 128 });
	});

	test("rgb → hsv → rgb 还原同一个颜色", () => {
		for (const rgb of [
			{ r: 255, g: 159, b: 10 },
			{ r: 175, g: 82, b: 222 },
			{ r: 52, g: 199, b: 89 },
		]) {
			expect(hsvToRgb(rgbToHsv(rgb))).toEqual(rgb);
		}
	});

	test("色相滑轨取到的都是饱和亮色", () => {
		expect(hueColor(0)).toBe("#ff0000");
		expect(hueColor(120)).toBe("#00ff00");
		expect(hueColor(240)).toBe("#0000ff");
		// 越界与负数都绕回圆环
		expect(hueColor(360)).toBe("#ff0000");
		expect(hueColor(-120)).toBe("#0000ff");
	});
});

describe("isSameColor", () => {
	test("不同写法指向同一颜色时为真", () => {
		expect(isSameColor("#abc", "rgb(170, 187, 204)")).toBe(true);
		expect(isSameColor("#ABC", "#aabbcc")).toBe(true);
		expect(isSameColor("#abc", "#abd")).toBe(false);
	});

	test("两边都没有颜色算相同，一边没有则不同", () => {
		expect(isSameColor(null, undefined)).toBe(true);
		expect(isSameColor("", "")).toBe(true);
		expect(isSameColor(null, null)).toBe(true);
		expect(isSameColor("#000", null)).toBe(false);
		expect(isSameColor(null, "#000")).toBe(false);
	});
});
