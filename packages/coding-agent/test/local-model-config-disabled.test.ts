import { describe, expect, it } from "vitest";
import { loadLocalModelConfig } from "../src/models/configuration/local-model-config.js";

describe("loadLocalModelConfig disabled providers", () => {
	it("跳过被用户停用的服务商,保留其余", () => {
		const serialized = JSON.stringify({
			providers: {
				on: { baseUrl: "http://a/v1", apiKey: "k", api: "openai-completions", models: [{ id: "m1" }] },
				off: {
					baseUrl: "http://b/v1",
					apiKey: "k",
					api: "openai-completions",
					disabled: true,
					models: [{ id: "m2" }],
				},
			},
		});
		const result = loadLocalModelConfig("models.json", { exists: () => true, read: () => serialized });
		expect(result.error).toBeUndefined();
		expect(result.models.map((m) => `${m.provider}/${m.id}`)).toEqual(["on/m1"]);
		expect(result.apiKeys.has("off")).toBe(false);
	});
});
