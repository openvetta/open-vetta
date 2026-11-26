import { describe, expect, it, vi } from "vitest";
import { removeLegacyMagpiePreset } from "./magpie-legacy-preset.js";
import type { ModelsConfig } from "./model-settings-service.js";

function serviceWith(config: ModelsConfig) {
	return {
		getConfig: vi.fn(async () => config),
		removeProvider: vi.fn(async () => {}),
	};
}

describe("removeLegacyMagpiePreset", () => {
	it("删掉旧版在 Vetta 里启用的 Magpie,停用的也删", async () => {
		const service = serviceWith({
			providers: { magpie: { source: "template", templateId: "magpie", apiKey: "magpie", disabled: true } },
		});
		await expect(removeLegacyMagpiePreset(service)).resolves.toEqual({ defaultModelCleared: false });
		expect(service.removeProvider).toHaveBeenCalledWith("magpie");
	});

	it("默认模型是 Magpie 的模型时告诉调用方它被清掉了", async () => {
		const service = serviceWith({
			defaultModel: "magpie/codex/gpt-6.1-sol",
			providers: { magpie: { source: "template", templateId: "magpie" } },
		});
		await expect(removeLegacyMagpiePreset(service)).resolves.toEqual({ defaultModelCleared: true });
	});

	it("Magpie 自己写进来的条目不动", async () => {
		const service = serviceWith({
			providers: { magpie: { source: "magpie", baseUrl: "http://127.0.0.1:3425/v1", apiKey: "mk-vetta" } },
		});
		await expect(removeLegacyMagpiePreset(service)).resolves.toBeNull();
		expect(service.removeProvider).not.toHaveBeenCalled();
	});

	it("用户自建的同名服务商和其它预设不动", async () => {
		const custom = serviceWith({ providers: { magpie: { baseUrl: "http://127.0.0.1:3425/v1" } } });
		await expect(removeLegacyMagpiePreset(custom)).resolves.toBeNull();
		const none = serviceWith({ providers: { deepseek: { source: "template", templateId: "deepseek" } } });
		await expect(removeLegacyMagpiePreset(none)).resolves.toBeNull();
		expect(custom.removeProvider).not.toHaveBeenCalled();
		expect(none.removeProvider).not.toHaveBeenCalled();
	});
});
