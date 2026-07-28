import type { Api, Model } from "@vetta/ai";
import { describe, expect, it, vi } from "vitest";
import {
	CodingAgentGreenfieldPromptAdapter,
	CodingAgentModelRegistryAdapter,
	type CodingAgentModelRegistrySource,
} from "../../src/adapters/runtime-core/index.js";

describe("Greenfield coding-agent adapters", () => {
	it("adapts ModelRegistry catalog, credentials and auth refresh without copying state", async () => {
		const refresh = vi.fn();
		const getApiKey = vi.fn(async () => "test-key");
		const setServerToken = vi.fn();
		const loadRemoteModels = vi.fn(async () => undefined);
		const source: CodingAgentModelRegistrySource = {
			refresh,
			getAvailable: () => [MODEL],
			find: (provider, modelId) => (provider === MODEL.provider && modelId === MODEL.id ? MODEL : undefined),
			getApiKey,
			setServerToken,
			loadRemoteModels,
		};
		const adapter = new CodingAgentModelRegistryAdapter(source);

		adapter.refresh();
		expect(adapter.listAvailable()).toEqual([MODEL]);
		expect(adapter.find("test", "model")).toBe(MODEL);
		expect(await adapter.resolve(MODEL)).toBe("test-key");
		await adapter.refreshAuth("server-token");

		expect(refresh).toHaveBeenCalledOnce();
		expect(getApiKey).toHaveBeenCalledWith(MODEL);
		expect(setServerToken).toHaveBeenCalledWith("server-token");
		expect(loadRemoteModels).toHaveBeenCalledOnce();
	});

	it("maps basic prompt fields without adding synthetic context", async () => {
		const adapter = new CodingAgentGreenfieldPromptAdapter({ now: () => 42 });
		const prepared = await adapter.prepare(
			{
				text: "inspect image",
				images: [{ type: "image", data: "base64", mimeType: "image/png" }],
				streamingBehavior: "followUp",
				modelKey: "test/model",
				reasoning: "medium",
			},
			{ sessionId: "session-1", queueing: false },
		);

		expect(prepared).toEqual({
			input: {
				message: {
					role: "user",
					content: [
						{ type: "text", text: "inspect image" },
						{ type: "image", data: "base64", mimeType: "image/png" },
					],
					timestamp: 42,
				},
			},
			options: { streamingBehavior: "followUp" },
		});
	});

	it("translates legacy prompt contributions into ordered generic context records", async () => {
		const adapter = new CodingAgentGreenfieldPromptAdapter({
			now: () => 42,
			resolvePromptResource: (text, promptRef) => ({
				text,
				promptRef,
				skillInjection: "<skill>review</skill>",
			}),
		});
		const prepared = await adapter.prepare(
			{
				text: "review this",
				promptRef: { kind: "skill", name: " review " },
				attachments: [{ kind: "file", path: "C:\\workspace\\a<b>.ts" }],
				metadata: {
					pluginInstructions: [" first ", 1, ""],
					knowledgeMode: true,
					settingsAssistInstruction: " configure ",
					settingsAssistTabId: " model ",
					ignored: true,
				},
			},
			{ sessionId: "session-1", queueing: false },
		);

		expect(prepared.input.message).toMatchObject({
			content: [{ type: "text", text: "review this" }],
			timestamp: 42,
		});
		expect(prepared.input.context?.map(({ type, modelVisible }) => ({ type, modelVisible }))).toEqual([
			{ type: "plugin_prompt_instruction", modelVisible: true },
			{ type: "knowledge_mode_instruction", modelVisible: true },
			{ type: "settings_assist_instruction", modelVisible: true },
			{ type: "prompt_attachment_context", modelVisible: true },
			{ type: "skill_expansion", modelVisible: true },
		]);
		expect(prepared.input.context?.[1]?.content).toContain("知识检索");
		expect(prepared.input.context?.[2]?.metadata).toEqual({ tabId: "model" });
		expect(prepared.input.context?.[3]?.content).toContain("a\\u003cb\\u003e.ts");
		expect(prepared.input.context?.[4]?.metadata).toEqual({
			promptRef: { kind: "skill", name: "review" },
		});
	});

	it("keeps unavailable resources model-invisible and flattens queued injections like the legacy path", async () => {
		const unavailable = new CodingAgentGreenfieldPromptAdapter({ now: () => 42 });
		const prepared = await unavailable.prepare(
			{ text: "use it", promptRef: { kind: "skill", name: "missing" }, attachments: [] },
			{ sessionId: "session-1", queueing: false },
		);
		expect(prepared.input.context).toMatchObject([
			{ type: "prompt_attachment_reference", modelVisible: false },
			{ type: "prompt_resource_reference", modelVisible: false },
		]);

		const queued = new CodingAgentGreenfieldPromptAdapter({
			now: () => 42,
			resolvePromptResource: (text, promptRef) => ({
				text,
				promptRef,
				sceneInjection: "<scene>deploy</scene>",
			}),
		});
		const queuedPrompt = await queued.prepare(
			{
				text: "now",
				promptRef: { kind: "scene", name: "deploy" },
				attachments: [{ kind: "file", path: "C:\\workspace\\deploy.md" }],
				streamingBehavior: "followUp",
			},
			{ sessionId: "session-1", queueing: true },
		);
		expect(queuedPrompt.input.context).toBeUndefined();
		expect(queuedPrompt.input.message.content).toEqual([
			{
				type: "text",
				text: expect.stringMatching(
					/^<prompt_attachments>[\s\S]+<\/prompt_attachments>[\s\S]+<scene>deploy<\/scene>\n\nnow$/,
				),
			},
		]);
	});
});

const MODEL: Model<Api> = {
	id: "model",
	name: "Model",
	api: "openai-responses",
	provider: "test",
	baseUrl: "https://example.test",
	reasoning: true,
	input: ["text", "image"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8_000,
	maxTokens: 1_000,
};
