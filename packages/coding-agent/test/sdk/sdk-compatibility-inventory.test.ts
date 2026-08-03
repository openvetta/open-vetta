import { describe, expect, it } from "vitest";
import {
	assessSdkCreateOptionsCompatibility,
	SDK_CREATE_OPTION_COMPATIBILITY,
	SDK_CREATE_OPTION_WIRING,
	SDK_CREATE_RESULT_COMPATIBILITY,
	SDK_SESSION_MEMBER_COMPATIBILITY,
} from "../../src/public-api/sdk-compatibility-inventory.js";

describe("SDK compatibility inventory", () => {
	it("classifies every current factory option and result field", () => {
		expect(Object.keys(SDK_CREATE_OPTION_COMPATIBILITY)).toHaveLength(36);
		expect(SDK_CREATE_RESULT_COMPATIBILITY).toEqual({
			session: "greenfield-core",
			extensionsResult: "product-adapter",
			modelFallbackMessage: "product-adapter",
		});
		expect(SDK_CREATE_OPTION_COMPATIBILITY.resourceLoader).toBe("legacy-concrete");
		expect(SDK_CREATE_OPTION_COMPATIBILITY.sessionManager).toBe("legacy-concrete");
	});

	it("accepts product and Legacy fields closed by the SDK Host Adapter", () => {
		expect(
			assessSdkCreateOptionsCompatibility({
				cwd: "C:\\workspace",
				includeAgentSkills: false,
				enableMcp: false,
			}),
		).toEqual({ compatible: true, issues: [] });
		expect(SDK_CREATE_OPTION_WIRING.resourceLoader).toBe("wired");
		expect(SDK_CREATE_OPTION_WIRING.sessionManager).toBe("wired");
		expect(assessSdkCreateOptionsCompatibility({ cwd: "C:\\workspace", thinkingLevel: "off" })).toEqual({
			compatible: true,
			issues: [],
		});
	});

	it("reports options that still require the complete AgentSession facade", () => {
		expect(assessSdkCreateOptionsCompatibility({ scopedModels: [], tools: [] })).toEqual({
			compatible: false,
			issues: [
				{
					code: "greenfield_sdk_option_not_wired",
					option: "scopedModels",
					disposition: "runtime-capability",
				},
				{
					code: "greenfield_sdk_option_not_wired",
					option: "tools",
					disposition: "product-adapter",
				},
			],
		});
	});

	it("distinguishes the closed core facade from later capabilities and implementation leaks", () => {
		for (const member of [
			"prompt",
			"steer",
			"followUp",
			"abort",
			"subscribe",
			"close",
			"sessionId",
			"sessionFile",
			"state",
			"messages",
			"model",
			"thinkingLevel",
			"isStreaming",
			"setModel",
			"setThinkingLevel",
		] as const) {
			expect(SDK_SESSION_MEMBER_COMPATIBILITY[member]).toBe("greenfield-core");
		}
		expect(SDK_SESSION_MEMBER_COMPATIBILITY.compact).toBe("runtime-capability");
		expect(SDK_SESSION_MEMBER_COMPATIBILITY.bindExtensions).toBe("product-adapter");
		expect(SDK_SESSION_MEMBER_COMPATIBILITY.agent).toBe("legacy-concrete");
	});
});
