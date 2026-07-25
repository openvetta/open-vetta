import { describe, expect, it } from "vitest";
import { CAPABILITY_ERROR_CODES, CAPABILITY_PREFIXES } from "../../src/contracts.js";
import { DOMAIN_MODEL_CAPABILITIES } from "../../src/domain.js";

describe("model domain capabilities", () => {
	it("uses one stable id per model operation", () => {
		expect(Object.values(DOMAIN_MODEL_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}model.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}model.config.get`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}model.provider.get`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}model.probe`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}model.key.validate`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}model.default.set`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}model.provider.upsert`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}model.provider.remove`,
		]);
	});

	it("validates sanitized model snapshots and provider mutations", () => {
		expect(
			DOMAIN_MODEL_CAPABILITIES.LIST.parseOutput({
				defaultModel: "openai/gpt-5",
				providers: [
					{
						id: "openai",
						displayName: "OpenAI",
						hasApiKey: true,
						modelCount: 1,
						models: [{ id: "gpt-5", reasoning: true }],
					},
				],
			}),
		).toHaveProperty("providers.0.models.0.id", "gpt-5");
		expect(
			DOMAIN_MODEL_CAPABILITIES.GET_CONFIG.parseOutput({
				defaultModel: "openai/gpt-5",
				providers: {
					openai: {
						apiKey: "***",
						headers: { Authorization: "***" },
						models: [{ id: "gpt-5", reasoningLevels: ["low", "high"] }],
					},
				},
			}),
		).toHaveProperty("providers.openai.apiKey", "***");
		expect(
			DOMAIN_MODEL_CAPABILITIES.UPSERT_PROVIDER.parseInput({
				provider: "openai",
				data: { apiKey: "", models: [{ id: "gpt-5", reasoning: true }] },
			}),
		).toEqual({
			provider: "openai",
			data: { apiKey: "", models: [{ id: "gpt-5", reasoning: true }] },
		});
		expect(() => DOMAIN_MODEL_CAPABILITIES.VALIDATE_KEY.parseInput({ modelKey: "invalid" })).not.toThrow();
		expect(() =>
			DOMAIN_MODEL_CAPABILITIES.UPSERT_PROVIDER.parseInput({
				provider: "openai",
				data: { models: [{ id: "" }] },
			}),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }));
	});
});
