// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AUTO_IMAGE_PROVIDER_ID, useImageGenerationSettingsModel } from "./useImageGenerationSettingsModel";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("./recordSettingsUsage", () => ({ recordSettingsUsage: vi.fn() }));

describe("useImageGenerationSettingsModel", () => {
	it("lists providers by supported mode and persists user selections", async () => {
		const set = vi.fn(async () => undefined);
		const onMediaProvidersChanged = vi.fn(() => () => undefined);
		(window as unknown as { vetta: unknown }).vetta = {
			config: {
				get: vi.fn(async () => ({
					imageGeneration: { textToImageProviderId: "remote:all" },
				})),
				set,
			},
			media: {
				customImageProviders: { list: vi.fn(async () => []) },
				listProviders: vi.fn(async () => [
					{
						id: "remote:all",
						displayName: "Remote Images",
						ownerId: "remote",
						protocolVersion: 5,
						capabilities: [
							{
								operation: "generate",
								kind: "image",
								modes: ["text-to-image", "image-to-image"],
								models: [
									{ id: "openai/gpt-image-2", displayName: "GPT Image 2", sourceDisplayName: "OpenAI", modes: ["text-to-image", "image-to-image"] },
								],
								defaultModelId: "openai/gpt-image-2",
							},
						],
					},
					{
						id: "remote:text-only",
						ownerId: "remote",
						protocolVersion: 5,
						capabilities: [
							{ operation: "generate", kind: "image", modes: ["text-to-image"] },
						],
					},
				]),
			},
			plugins: { onMediaProvidersChanged },
		};

		const { result } = renderHook(() => useImageGenerationSettingsModel());
		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.textToImageRouteId).toBe("remote%3Aall::openai%2Fgpt-image-2");
		expect(result.current.textToImageOptions.map((option) => option.value)).toEqual([
			AUTO_IMAGE_PROVIDER_ID,
			"remote%3Aall::openai%2Fgpt-image-2",
			"remote%3Atext-only",
		]);
		expect(result.current.imageToImageOptions.map((option) => option.value)).toEqual([
			AUTO_IMAGE_PROVIDER_ID,
			"remote%3Aall::openai%2Fgpt-image-2",
		]);

		await act(async () => {
			await result.current.actions.setImageToImageRoute("remote%3Aall::openai%2Fgpt-image-2");
		});
		expect(set).toHaveBeenCalledWith({
			imageGeneration: { imageToImageProviderId: "remote:all", imageToImageModelId: "openai/gpt-image-2" },
		});

		await act(async () => {
			await result.current.actions.setTextToImageRoute(AUTO_IMAGE_PROVIDER_ID);
		});
		expect(set).toHaveBeenLastCalledWith({
			imageGeneration: { textToImageProviderId: null, textToImageModelId: null },
		});
		expect(onMediaProvidersChanged).toHaveBeenCalledOnce();
	});

	it("keeps a missing saved provider visible as unavailable", async () => {
		(window as unknown as { vetta: unknown }).vetta = {
			config: {
				get: vi.fn(async () => ({ imageGeneration: { textToImageProviderId: "missing:images" } })),
				set: vi.fn(async () => undefined),
			},
			media: { customImageProviders: { list: vi.fn(async () => []) }, listProviders: vi.fn(async () => []) },
			plugins: { onMediaProvidersChanged: vi.fn(() => () => undefined) },
		};
		const { result } = renderHook(() => useImageGenerationSettingsModel());
		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.textToImageOptions).toContainEqual({
			value: "missing%3Aimages",
			label: "missing:images (agentSettings.imageGeneration.unavailable)",
		});
	});

	it("saves a custom service, sends the key one-way, then reloads so it shows up in the dropdowns", async () => {
		const custom = [] as Array<Record<string, unknown>>;
		const providers = [] as Array<Record<string, unknown>>;
		const save = vi.fn(async (input: Record<string, unknown>) => {
			custom.push({ ...input, id: "c1", apiKey: undefined, hasApiKey: true });
			providers.push({
				id: "custom-openai:c1",
				displayName: input.name,
				ownerId: "desktop-app",
				protocolVersion: 5,
				capabilities: [
					{
						operation: "generate",
						kind: "image",
						modes: ["text-to-image"],
						models: [{ id: input.model, sourceDisplayName: input.name, modes: ["text-to-image"] }],
						defaultModelId: input.model,
					},
				],
			});
			return custom[0];
		});
		(window as unknown as { vetta: unknown }).vetta = {
			config: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) },
			media: {
				customImageProviders: { list: vi.fn(async () => custom), save, remove: vi.fn(async () => undefined) },
				listProviders: vi.fn(async () => providers),
			},
			plugins: { onMediaProvidersChanged: vi.fn(() => () => undefined) },
		};
		const { result } = renderHook(() => useImageGenerationSettingsModel());
		await waitFor(() => expect(result.current.loading).toBe(false));

		act(() => result.current.custom.startAdd());
		act(() => result.current.custom.updateDraft({ name: "Mine", baseUrl: "https://x.example/v1", model: "m-1" }));
		await act(async () => result.current.custom.save());
		expect(save).not.toHaveBeenCalled(); // 缺 key，前端先拦
		expect(result.current.custom.error).toBe("agentSettings.imageGeneration.custom.errors.apiKey");

		act(() => result.current.custom.updateDraft({ apiKey: " sk-secret " }));
		await act(async () => result.current.custom.save());

		expect(save).toHaveBeenCalledWith({
			name: "Mine",
			baseUrl: "https://x.example/v1",
			model: "m-1",
			supportsTextToImage: true,
			supportsImageToImage: false,
			apiKey: "sk-secret",
		});
		expect(result.current.custom.draft).toBeNull();
		expect(result.current.custom.providers).toHaveLength(1);
		expect(JSON.stringify(result.current.custom.providers)).not.toContain("sk-secret");
		expect(result.current.textToImageOptions).toContainEqual({
			value: "custom-openai%3Ac1::m-1",
			label: "Mine · m-1",
		});
		expect(result.current.imageToImageOptions).toHaveLength(1); // 只有「自动」
	});
});
