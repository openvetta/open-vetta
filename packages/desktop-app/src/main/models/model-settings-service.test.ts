import { describe, expect, it, vi } from "vitest";
import { ModelSettingsService, type ModelsConfig } from "./model-settings-service.js";

function createConfig(): ModelsConfig {
	return {
		defaultModel: "openai/gpt-5",
		providers: {
			openai: {
				displayName: "OpenAI",
				apiKey: "secret",
				headers: { Authorization: "Bearer secret", "X-Region": "us" },
				models: [{ id: "gpt-5", reasoning: true }],
			},
		},
	};
}

describe("ModelSettingsService", () => {
	it("returns sanitized provider data without losing non-secret fields", async () => {
		const service = new ModelSettingsService({
			readConfig: async () => createConfig(),
			writeConfig: vi.fn(),
			refreshRegistry: vi.fn(),
		});

		await expect(service.getSanitizedConfig()).resolves.toEqual({
			defaultModel: "openai/gpt-5",
			providers: {
				openai: {
					displayName: "OpenAI",
					apiKey: "***",
					headers: { Authorization: "***", "X-Region": "us" },
					models: [{ id: "gpt-5", reasoning: true }],
				},
			},
		});
	});

	it("atomically updates one provider and refreshes the shared registry", async () => {
		let config = createConfig();
		const writeConfig = vi.fn<(next: ModelsConfig) => Promise<void>>(async (next) => {
			config = next;
		});
		const refreshRegistry = vi.fn<() => Promise<void>>(async () => {});
		const service = new ModelSettingsService({
			readConfig: async () => config,
			writeConfig,
			refreshRegistry,
		});

		await expect(
			service.upsertProvider("openai", {
				displayName: "OpenAI Updated",
				models: [{ id: "gpt-5.1", reasoning: true }],
			}),
		).resolves.toEqual({
			displayName: "OpenAI Updated",
			apiKey: "***",
			headers: { Authorization: "***", "X-Region": "us" },
			models: [{ id: "gpt-5.1", reasoning: true }],
		});
		expect(writeConfig).toHaveBeenCalledWith({
			defaultModel: "openai/gpt-5",
			providers: {
				openai: {
					displayName: "OpenAI Updated",
					apiKey: "secret",
					headers: { Authorization: "Bearer secret", "X-Region": "us" },
					models: [{ id: "gpt-5.1", reasoning: true }],
				},
			},
		});
		expect(refreshRegistry).toHaveBeenCalledOnce();
	});

	it("clears a removed provider from the default model", async () => {
		let config = createConfig();
		const service = new ModelSettingsService({
			readConfig: async () => config,
			writeConfig: async (next) => {
				config = next;
			},
			refreshRegistry: async () => {},
		});

		await service.removeProvider("openai");

		expect(config).toEqual({ providers: {} });
	});
});
