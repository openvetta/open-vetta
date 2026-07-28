import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Api, type AssistantMessage, type AssistantMessageEvent, EventStream, type Model } from "@vetta/ai";
import {
	adaptMcpTool,
	type IMcpClient,
	type McpServerInstance,
	type McpTool,
} from "@vetta/coding-agent/core/mcp/index.js";
import type { CodingAgentModelRegistrySource } from "@vetta/coding-agent/runtime-host/greenfield";
import type { McpRuntimeToolSource } from "@vetta/runtime-mcp";
import { FileConversationRepository } from "@vetta/runtime-storage/conversation";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createGreenfieldRuntimeComposition,
	type GreenfieldRuntimeComposition,
} from "../src/greenfield-runtime-composition.js";

describe("Greenfield runtime composition", () => {
	const temporaryDirectories: string[] = [];
	const compositions: GreenfieldRuntimeComposition[] = [];

	afterEach(async () => {
		for (const composition of compositions.splice(0).reverse()) {
			await composition.dispose();
		}
		for (const directory of temporaryDirectories.splice(0).reverse()) {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("runs prompt, real read tool, persistence, resume and continue through the parallel backend", async () => {
		const workspace = await createTemporaryDirectory("greenfield-runtime-workspace-");
		const conversations = await createTemporaryDirectory("greenfield-runtime-conversations-");
		await writeFile(join(workspace, "message.txt"), "hello from the Greenfield composition", "utf8");
		await seedRetryConversation(conversations);
		const responses = [
			assistantMessage(
				[{ type: "toolCall", id: "read-1", name: "read", arguments: { path: "message.txt" } }],
				"toolUse",
			),
			assistantMessage([{ type: "text", text: "Read complete." }]),
			assistantMessage([{ type: "text", text: "Continued without another user message." }]),
		];
		const modelCalls: Array<{
			readonly model: Model<Api>;
			readonly apiKey: string | undefined;
			readonly tools: string[];
		}> = [];
		let responseIndex = 0;
		const composition = await createGreenfieldRuntimeComposition({
			conversationDir: conversations,
			modelRegistry: modelRegistry(),
			initialModel: MODEL,
			initialThinkingLevel: "off",
			cwd: workspace,
			activation: { mode: "explicit", toolNames: ["read"] },
			streamFn: (model, context, options) => {
				modelCalls.push({
					model,
					apiKey: options?.apiKey,
					tools: (context.tools ?? []).map(({ name }) => name),
				});
				const response = responses[responseIndex];
				responseIndex += 1;
				if (!response) throw new Error("Missing recorded response");
				return new RecordedAssistantStream(response);
			},
		});
		compositions.push(composition);

		const session = await composition.backend.create({ sessionId: "session-1" });
		await session.prompt({ text: "Read message.txt" });
		const firstMessages = await session.getMessages();

		expect(firstMessages.map(({ role }) => role)).toEqual(["user", "assistant", "toolResult", "assistant"]);
		expect(firstMessages.find(({ role }) => role === "toolResult")).toMatchObject({
			content: [{ type: "text", text: expect.stringContaining("hello from the Greenfield composition") }],
		});
		expect(modelCalls.slice(0, 2)).toEqual([
			{ model: MODEL, apiKey: "test-key", tools: ["read"] },
			{ model: MODEL, apiKey: "test-key", tools: ["read"] },
		]);
		await session.dispose();

		const resumed = await composition.backend.resume({ sessionId: "session-1" });
		expect((await resumed.getMessages()).map(({ role }) => role)).toEqual([
			"user",
			"assistant",
			"toolResult",
			"assistant",
		]);
		await resumed.dispose();

		const retrySession = await composition.backend.resume({ sessionId: "retry-session" });
		await retrySession.continue();
		const retriedMessages = await retrySession.getMessages();
		expect(retriedMessages.map(({ role }) => role)).toEqual(["user", "assistant"]);
		expect(retriedMessages.at(-1)).toMatchObject({
			content: [{ type: "text", text: "Continued without another user message." }],
		});
		expect(modelCalls.at(-1)).toEqual({ model: MODEL, apiKey: "test-key", tools: ["read"] });
		await retrySession.dispose();
	});

	it("reflects registry changes on the next model call without rebuilding the session", async () => {
		const conversations = await createTemporaryDirectory("greenfield-runtime-dynamic-tools-");
		const toolLists: string[][] = [];
		const composition = await createGreenfieldRuntimeComposition({
			conversationDir: conversations,
			modelRegistry: modelRegistry(),
			initialModel: MODEL,
			initialThinkingLevel: "off",
			activation: { mode: "explicit", toolNames: ["read"] },
			streamFn: (_model, context) => {
				toolLists.push((context.tools ?? []).map(({ name }) => name));
				return new RecordedAssistantStream(assistantMessage([{ type: "text", text: "done" }]));
			},
		});
		compositions.push(composition);
		const session = await composition.backend.create({ sessionId: "dynamic-tools" });

		await session.prompt({ text: "first" });
		expect(composition.tools.registry.deactivate("read")).toBe(true);
		await session.prompt({ text: "second" });

		expect(toolLists).toEqual([["read"], []]);
		expect(session.readState().activeToolNames).toEqual([]);
		await session.dispose();
	});

	it("registers legacy-equivalent knowledge tools while keeping host availability fail-closed", async () => {
		const enabledConversations = await createTemporaryDirectory("greenfield-runtime-knowledge-enabled-");
		const enabledModelTools: string[][] = [];
		const enabled = await createGreenfieldRuntimeComposition({
			conversationDir: enabledConversations,
			modelRegistry: modelRegistry(),
			initialModel: MODEL,
			initialThinkingLevel: "off",
			knowledgeEnabled: true,
			streamFn: (_model, context) => {
				enabledModelTools.push((context.tools ?? []).map(({ name }) => name));
				return new RecordedAssistantStream(assistantMessage([{ type: "text", text: "done" }]));
			},
		});
		compositions.push(enabled);
		const enabledSession = await enabled.backend.create({ sessionId: "knowledge-enabled" });

		await enabledSession.prompt({ text: "normal" });
		await enabledSession.prompt({ text: "search knowledge", metadata: { knowledgeMode: true } });
		expect(enabledModelTools[0]).not.toEqual(expect.arrayContaining(["kb_list_available_tags", "kb_filter_by_tags"]));
		expect(enabledModelTools[1]).toEqual(expect.arrayContaining(["kb_list_available_tags", "kb_filter_by_tags"]));
		await enabledSession.dispose();

		const disabledConversations = await createTemporaryDirectory("greenfield-runtime-knowledge-disabled-");
		const disabledModelTools: string[][] = [];
		const disabled = await createGreenfieldRuntimeComposition({
			conversationDir: disabledConversations,
			modelRegistry: modelRegistry(),
			initialModel: MODEL,
			initialThinkingLevel: "off",
			knowledgeEnabled: false,
			streamFn: (_model, context) => {
				disabledModelTools.push((context.tools ?? []).map(({ name }) => name));
				return new RecordedAssistantStream(assistantMessage([{ type: "text", text: "done" }]));
			},
		});
		compositions.push(disabled);
		const disabledSession = await disabled.backend.create({ sessionId: "knowledge-disabled" });

		await disabledSession.prompt({
			text: "search unavailable knowledge",
			metadata: { knowledgeMode: true },
		});
		expect(disabledModelTools[0]).not.toEqual(
			expect.arrayContaining(["kb_list_available_tags", "kb_filter_by_tags"]),
		);
		expect(disabled.tools.registry.snapshot().registrations.map(({ tool }) => tool.name)).toEqual(
			expect.arrayContaining(["kb_list_available_tags", "kb_filter_by_tags"]),
		);
		await disabledSession.dispose();
	});

	it("creates stateful prompt resource resolvers per session", async () => {
		const conversations = await createTemporaryDirectory("greenfield-runtime-session-resolvers-");
		const createPromptResourceResolver = vi.fn((sessionOptions: { readonly sessionId: string }) => {
			return (text: string) => ({
				text,
				skillInjection: `<skill>${sessionOptions.sessionId}</skill>`,
			});
		});
		const composition = await createGreenfieldRuntimeComposition({
			conversationDir: conversations,
			modelRegistry: modelRegistry(),
			initialModel: MODEL,
			initialThinkingLevel: "off",
			createPromptResourceResolver,
		});
		compositions.push(composition);

		const first = await composition.backend.create({ sessionId: "first-session" });
		const second = await composition.backend.create({ sessionId: "second-session" });

		expect(createPromptResourceResolver.mock.calls.map(([options]) => options.sessionId)).toEqual([
			"first-session",
			"second-session",
		]);
		await first.dispose();
		await second.dispose();
	});

	it("synchronizes MCP additions and removals before each model call", async () => {
		const conversations = await createTemporaryDirectory("greenfield-runtime-mcp-");
		const tool: McpTool = {
			name: "lookup",
			description: "Lookup a value",
			inputSchema: { type: "object", properties: {} },
		};
		const client = createMcpClient();
		const adaptedTool = adaptMcpTool(tool, client, "search");
		let available = true;
		const server: McpServerInstance = {
			name: "search",
			config: { command: "test" },
			status: "ready",
			client,
			tools: [tool],
			resources: [],
			startedAt: new Date(1),
		};
		const reloadIfChanged = vi.fn(async () => false);
		const mcpSource: McpRuntimeToolSource = {
			reloadIfChanged,
			getServers: () => (available ? [server] : []),
			getTools: () => (available ? [adaptedTool] : []),
		};
		const modelTools: string[][] = [];
		const composition = await createGreenfieldRuntimeComposition({
			conversationDir: conversations,
			modelRegistry: modelRegistry(),
			initialModel: MODEL,
			initialThinkingLevel: "off",
			mcpSource,
			streamFn: (_model, context) => {
				modelTools.push((context.tools ?? []).map(({ name }) => name));
				return new RecordedAssistantStream(assistantMessage([{ type: "text", text: "done" }]));
			},
		});
		compositions.push(composition);
		const session = await composition.backend.create({ sessionId: "mcp-session" });
		expect(session.readState().activeToolNames).toContain("mcp_search_lookup");
		const initialBinding = composition.tools.registry.resolve("mcp_search_lookup")?.binding;

		await session.prompt({ text: "unchanged MCP" });
		expect(modelTools[0]).toContain("mcp_search_lookup");
		expect(composition.tools.registry.resolve("mcp_search_lookup")?.binding).toEqual(initialBinding);

		available = false;
		await session.prompt({ text: "without MCP" });
		expect(modelTools[1]).not.toContain("mcp_search_lookup");
		expect(composition.tools.registry.resolve("mcp_search_lookup")).toBeUndefined();

		available = true;
		await session.prompt({ text: "with MCP again" });
		expect(modelTools[2]).toContain("mcp_search_lookup");
		expect(reloadIfChanged).toHaveBeenCalledTimes(4);
		await session.dispose();
	});

	it("persists hidden prompt contributions while keeping the chat projection clean", async () => {
		const conversations = await createTemporaryDirectory("greenfield-runtime-prompt-context-");
		const modelInputs: string[][] = [];
		const composition = await createGreenfieldRuntimeComposition({
			conversationDir: conversations,
			modelRegistry: modelRegistry(),
			initialModel: MODEL,
			initialThinkingLevel: "off",
			resolvePromptResource: (text, promptRef) => ({
				text,
				promptRef,
				skillInjection: "<skill>review</skill>",
			}),
			streamFn: (_model, context) => {
				modelInputs.push(context.messages.map((message) => messageText(message)));
				return new RecordedAssistantStream(assistantMessage([{ type: "text", text: "done" }]));
			},
		});
		compositions.push(composition);
		const session = await composition.backend.create({ sessionId: "prompt-context" });

		await session.prompt({
			text: "inspect",
			promptRef: { kind: "skill", name: "review" },
			attachments: [{ kind: "file", path: "C:\\workspace\\file.ts" }],
			metadata: {
				pluginInstructions: ["plugin instruction"],
				settingsAssistInstruction: "settings instruction",
			},
		});

		expect(modelInputs[0]).toEqual([
			"plugin instruction",
			"settings instruction",
			expect.stringContaining("<prompt_attachments>"),
			"<skill>review</skill>",
			"inspect",
		]);
		expect((await session.getMessages()).map(({ role }) => role)).toEqual(["user", "assistant"]);
		expect(session.readHistory()).toMatchObject([
			{ type: "settings_assist_marker" },
			{ type: "prompt_attachments_marker" },
			{ type: "prompt_ref_marker" },
			{ type: "message", message: { role: "user" } },
			{ type: "message", message: { role: "assistant" } },
		]);
		await session.dispose();

		const resumed = await composition.backend.resume({ sessionId: "prompt-context" });
		await resumed.prompt({ text: "again" });
		expect(modelInputs[1]).toEqual([
			"plugin instruction",
			"settings instruction",
			expect.stringContaining("<prompt_attachments>"),
			"<skill>review</skill>",
			"inspect",
			"done",
			"again",
		]);
		await resumed.dispose();
	});

	async function createTemporaryDirectory(prefix: string): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), prefix));
		temporaryDirectories.push(directory);
		return directory;
	}
});

async function seedRetryConversation(rootDir: string): Promise<void> {
	const repository = new FileConversationRepository({ rootDir });
	try {
		await repository.create({ sessionId: "retry-session", createdAt: 1 });
		await repository.append("retry-session", 0, [
			{
				type: "turn.started",
				sessionId: "retry-session",
				turnId: "failed-turn",
				snapshotId: "seed",
				timestamp: 1,
			},
			{
				type: "message.appended",
				sessionId: "retry-session",
				turnId: "failed-turn",
				message: { role: "user", content: "Retry this request", timestamp: 1 },
				timestamp: 1,
			},
			{
				type: "turn.failed",
				sessionId: "retry-session",
				turnId: "failed-turn",
				error: { code: "SEEDED_FAILURE", message: "Seeded retry state" },
				timestamp: 1,
			},
		]);
	} finally {
		await repository.close();
	}
}

class RecordedAssistantStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
	constructor(message: AssistantMessage) {
		super(
			(event) => event.type === "done" || event.type === "error",
			(event) => {
				if (event.type === "done") return event.message;
				if (event.type === "error") return event.error;
				throw new Error("Unexpected assistant event");
			},
		);
		queueMicrotask(() => {
			if (message.stopReason === "error" || message.stopReason === "aborted") {
				this.push({ type: "error", reason: message.stopReason, error: message });
				return;
			}
			this.push({ type: "done", reason: message.stopReason, message });
		});
	}
}

function modelRegistry(): CodingAgentModelRegistrySource {
	return {
		refresh() {},
		getAvailable: () => [MODEL],
		find: (provider, modelId) => (provider === MODEL.provider && modelId === MODEL.id ? MODEL : undefined),
		getApiKey: async () => "test-key",
		setServerToken() {},
		loadRemoteModels: async () => undefined,
	};
}

function assistantMessage(
	content: AssistantMessage["content"],
	stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: MODEL.api,
		provider: MODEL.provider,
		model: MODEL.id,
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason,
		timestamp: 2,
	};
}

function messageText(message: unknown): string {
	if (!isRecord(message)) return "";
	const content = message.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((item): item is { readonly type: "text"; readonly text: string } => {
			return isRecord(item) && item.type === "text" && typeof item.text === "string";
		})
		.map(({ text }) => text)
		.join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

const MODEL: Model<Api> = {
	id: "recorded-model",
	name: "Recorded Model",
	api: "openai-responses",
	provider: "test",
	baseUrl: "https://example.test",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8_000,
	maxTokens: 1_000,
};

function createMcpClient(): IMcpClient {
	return {
		async initialize() {
			throw new Error("Not used");
		},
		async listTools() {
			throw new Error("Not used");
		},
		async callTool() {
			return { content: [{ type: "text", text: "result" }] };
		},
		async listResources() {
			throw new Error("Not used");
		},
		async readResource() {
			throw new Error("Not used");
		},
		async listPrompts() {
			throw new Error("Not used");
		},
		async close() {},
	};
}
