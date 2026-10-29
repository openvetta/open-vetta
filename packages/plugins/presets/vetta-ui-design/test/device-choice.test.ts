import { describe, expect, it } from "vitest";
import { CATEGORY_IDS, defaultCategory, modeOfCategory, resolveChoice } from "../src/interaction/device-choice";
import { SIZE_CATEGORIES } from "../src/vetd/size-presets";

describe("device-choice 与画布尺寸面板同源", () => {
	it("分类就是画布面板的那五类，顺序也一样", () => {
		expect(CATEGORY_IDS).toEqual(SIZE_CATEGORIES.map((entry) => entry.id));
		expect(CATEGORY_IDS).toEqual(["phone", "desktop", "watch", "paper", "ipad"]);
	});

	it("预设的尺寸和圆角取自同一张表", () => {
		const phone = resolveChoice({ id: "iphone-17-pro", orientation: "portrait" });
		expect(phone?.size).toEqual({ width: 402, height: 874 });
		expect(phone?.radius).toBe(62);
		const mac = resolveChoice({ id: "macbook-pro-14", orientation: "portrait" });
		expect(mac?.size).toEqual({ width: 1512, height: 982 });
		expect(mac?.radius).toBe(0);
	});

	it("只有 iPad 这种可旋转的分类会横过来，手机选横屏也是竖的", () => {
		const ipad = SIZE_CATEGORIES.find((entry) => entry.id === "ipad")?.presets[0];
		expect(ipad).toBeDefined();
		const portrait = resolveChoice({ id: ipad?.id ?? "", orientation: "portrait" });
		const landscape = resolveChoice({ id: ipad?.id ?? "", orientation: "landscape" });
		expect(landscape?.size).toEqual({ width: portrait?.size.height, height: portrait?.size.width });
		expect(resolveChoice({ id: "iphone-17", orientation: "landscape" })?.size).toEqual({ width: 393, height: 852 });
	});

	it("选了某类预设就意味着对应的设备类型", () => {
		expect(modeOfCategory("phone")).toBe("mobile");
		expect(modeOfCategory("desktop")).toBe("desktop");
		for (const id of ["watch", "paper", "ipad"] as const) expect(modeOfCategory(id)).toBe("other");
	});

	it("预设表改过、旧选择失效时当没选", () => {
		expect(resolveChoice({ id: "gone", orientation: "portrait" })).toBeNull();
		expect(resolveChoice(null)).toBeNull();
	});

	it("浮层默认翻到当前选的分类，没选就按设备类型", () => {
		expect(defaultCategory({ id: "macbook-pro-14", orientation: "portrait" }, "mobile")).toBe("desktop");
		expect(defaultCategory(null, "desktop")).toBe("desktop");
		expect(defaultCategory(null, "mobile")).toBe("phone");
		expect(defaultCategory(null, "other")).toBe("phone");
	});
});
