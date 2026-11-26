import { describe, expect, it } from "vitest";
import { removeLegacyMagpiePreset } from "./magpie-legacy-preset.js";
import type { ModelsConfig } from "./model-settings-service.js";

/** 只实现迁移用到的两个方法:删服务商时真的从配置里删掉,测试看最终剩下什么。 */
function serviceWith(initial: ModelsConfig) {
	const config: ModelsConfig = { ...initial, providers: { ...initial.providers } };
	return {
		config,
		getConfig: async () => config,
		removeProvider: async (providerId: string) => {
			delete config.providers[providerId];
		},
	};
}

describe("removeLegacyMagpiePreset", () => {
	it("删掉旧版在 Vetta 里启用的 Magpie,停用的也删", async () => {
		const service = serviceWith({
			providers: { magpie: { source: "template", templateId: "magpie", apiKey: "magpie", disabled: true } },
		});
		await expect(removeLegacyMagpiePreset(service)).resolves.toEqual({
			defaultModelCleared: false,
			noProvidersLeft: true,
		});
		expect(service.config.providers).toEqual({});
	});

	it("默认模型是 Magpie 的模型时告诉调用方它被清掉了", async () => {
		const service = serviceWith({
			defaultModel: "magpie/codex/gpt-6.1-sol",
			providers: { magpie: { source: "template", templateId: "magpie" } },
		});
		await expect(removeLegacyMagpiePreset(service)).resolves.toEqual({
			defaultModelCleared: true,
			noProvidersLeft: true,
		});
	});

	it("还有别的启用中的服务商时,不算删光了", async () => {
		const service = serviceWith({
			providers: {
				magpie: { source: "template", templateId: "magpie" },
				deepseek: { source: "template", templateId: "deepseek", apiKey: "sk" },
			},
		});
		await expect(removeLegacyMagpiePreset(service)).resolves.toEqual({
			defaultModelCleared: false,
			noProvidersLeft: false,
		});
	});

	it("剩下的服务商全是停用的,也算删光了:用户手上没有能用的模型", async () => {
		const service = serviceWith({
			providers: {
				magpie: { source: "template", templateId: "magpie" },
				deepseek: { source: "template", templateId: "deepseek", disabled: true },
			},
		});
		await expect(removeLegacyMagpiePreset(service)).resolves.toEqual({
			defaultModelCleared: false,
			noProvidersLeft: true,
		});
	});

	it("Magpie 自己写进来的条目不动", async () => {
		const service = serviceWith({
			providers: { magpie: { source: "magpie", baseUrl: "http://127.0.0.1:3425/v1", apiKey: "mk-vetta" } },
		});
		await expect(removeLegacyMagpiePreset(service)).resolves.toBeNull();
		expect(Object.keys(service.config.providers)).toEqual(["magpie"]);
	});

	it("用户自建的同名服务商和其它预设不动", async () => {
		const custom = serviceWith({ providers: { magpie: { baseUrl: "http://127.0.0.1:3425/v1" } } });
		await expect(removeLegacyMagpiePreset(custom)).resolves.toBeNull();
		const none = serviceWith({ providers: { deepseek: { source: "template", templateId: "deepseek" } } });
		await expect(removeLegacyMagpiePreset(none)).resolves.toBeNull();
		expect(Object.keys(custom.config.providers)).toEqual(["magpie"]);
		expect(Object.keys(none.config.providers)).toEqual(["deepseek"]);
	});
});
