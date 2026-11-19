import { describe, expect, it } from "vitest";
import { filterVisibleSettingsTabs, SETTINGS_TABS, type SettingsTabVisibilityContext } from "./registry";

const BASE: SettingsTabVisibilityContext = {
	isMac: false,
	isWindows: false,
};

function visibleKeys(context: Partial<SettingsTabVisibilityContext>): string[] {
	return filterVisibleSettingsTabs(SETTINGS_TABS, { ...BASE, ...context }).map((tab) => tab.key);
}

describe("设置标签可见性", () => {
	it("远程连接在所有平台上出现", () => {
		expect(visibleKeys({ isWindows: true })).toContain("remote");
		expect(visibleKeys({ isMac: true })).toContain("remote");
		expect(visibleKeys({})).toContain("remote");
	});

	it("macOnly 标签仅在 Mac 上出现", () => {
		expect(visibleKeys({ isMac: true })).toEqual(expect.arrayContaining(["appshot", "permissions"]));
		expect(visibleKeys({ isWindows: true })).not.toContain("appshot");
		expect(visibleKeys({ isWindows: true })).not.toContain("permissions");
	});

	it("无平台限制的标签在任何平台都可见", () => {
		for (const context of [{ isMac: true }, { isWindows: true }, {}]) {
			expect(visibleKeys(context)).toEqual(expect.arrayContaining(["general", "appearance", "models"]));
		}
	});
});

describe("更多选项入口", () => {
	it("排在标签列表最后", () => {
		expect(SETTINGS_TABS.at(-1)?.key).toBe("extensions");
	});

	it("不带平台限制，任何环境都能进插件页面", () => {
		expect(visibleKeys({})).toContain("extensions");
		expect(visibleKeys({ isMac: true })).toContain("extensions");
	});
});
