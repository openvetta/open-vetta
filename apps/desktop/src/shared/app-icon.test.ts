import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ICON_DEFAULT, APP_ICON_IDS, isAppIconId, normalizeAppIconId } from "./app-icon.js";

describe("app-icon", () => {
	it("未知或非字符串回落默认，合法 id 原样保留", () => {
		expect(normalizeAppIconId("coding")).toBe("coding");
		expect(normalizeAppIconId("removed-icon")).toBe(APP_ICON_DEFAULT);
		expect(normalizeAppIconId(undefined)).toBe(APP_ICON_DEFAULT);
		expect(isAppIconId(42)).toBe(false);
	});

	it("除默认外，每个图标都有打包进应用的图片和设置页预览图", () => {
		for (const id of APP_ICON_IDS) {
			if (id === APP_ICON_DEFAULT) continue;
			expect(existsSync(join(__dirname, `../../build/app-icons/${id}.png`)), `build/app-icons/${id}.png`).toBe(true);
		}
		for (const id of APP_ICON_IDS) {
			expect(
				existsSync(join(__dirname, `../renderer/domains/settings/assets/app-icons/${id}.png`)),
				`preview ${id}`,
			).toBe(true);
		}
	});
});
