import { describe, expect, it } from "vitest";
import { DEFAULT_PET_CONFIG, normalizePetConfig } from "./pet-config";

describe("桌宠默认配置", () => {
	it("首次使用（还没有配置文件）时桌宠默认关闭，需要用户主动打开", () => {
		expect(DEFAULT_PET_CONFIG.enabled).toBe(false);
		expect(normalizePetConfig(undefined).enabled).toBe(false);
		expect(normalizePetConfig({}).enabled).toBe(false);
	});

	it("已经打开过桌宠的用户保留自己的选择", () => {
		expect(normalizePetConfig({ enabled: true }).enabled).toBe(true);
	});

	it("旧配置里残留的气泡样式字段会被丢弃", () => {
		const config = normalizePetConfig({ enabled: true, bubbleStyleId: "stoat_christmas_corner_border_set" });
		expect(config).not.toHaveProperty("bubbleStyleId");
	});
});
