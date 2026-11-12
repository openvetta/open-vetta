import { Type } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";
import { type AssistantMessage, type Context, createPromptCacheDiagnostics } from "../src/index.js";

describe("prompt cache diagnostics", () => {
	it("ignores local bookkeeping and the current request tail", () => {
		const first = createPromptCacheDiagnostics(context());
		const changed = context();
		const assistant = changed.messages[1] as AssistantMessage;
		assistant.timestamp = 999;
		assistant.usage = { ...assistant.usage, input: 999 };
		const toolResult = changed.messages[2];
		if (toolResult?.role !== "toolResult") throw new Error("Missing tool result fixture");
		changed.messages[2] = { ...toolResult, details: { local: "changed" }, timestamp: 888 };
		changed.messages[3] = { role: "user", content: "a different current request", timestamp: 777 };

		const next = createPromptCacheDiagnostics(changed);
		const { requestMessagesHash: firstRequestHash, ...firstPrefix } = first;
		const { requestMessagesHash: nextRequestHash, ...nextPrefix } = next;
		expect(nextPrefix).toEqual(firstPrefix);
		expect(nextRequestHash).not.toBe(firstRequestHash);
	});

	it("isolates stable system, volatile system, tools, and history changes", () => {
		const base = context();
		const original = createPromptCacheDiagnostics(base);
		const volatileChanged = createPromptCacheDiagnostics({
			...base,
			systemPrompt: "Stable prefix\n\nnew volatile tail",
		});
		const stableChanged = createPromptCacheDiagnostics({
			...base,
			systemPrompt: "Changed prefix\n\nvolatile tail",
			systemPromptStableLength: "Changed prefix".length,
		});

		expect(volatileChanged.volatileSystemPromptHash).not.toBe(original.volatileSystemPromptHash);
		expect(volatileChanged.cachePrefixHash).toBe(original.cachePrefixHash);
		expect(stableChanged.stableSystemPromptHash).not.toBe(original.stableSystemPromptHash);
		expect(stableChanged.cachePrefixHash).not.toBe(original.cachePrefixHash);
	});

	it("canonicalizes schema object keys while preserving tool order", () => {
		const base = context();
		const reorderedKeys = context();
		const readParameters = base.tools?.[0]?.parameters;
		if (!readParameters) throw new Error("Missing read tool parameters");
		reorderedKeys.tools = [
			{
				name: "read",
				description: "Read",
				parameters: {
					...readParameters,
					properties: { b: Type.Number(), a: Type.String() },
				},
			},
			{ name: "write", description: "Write", parameters: Type.Object({ path: Type.String() }) },
		];
		const reversedTools = { ...reorderedKeys, tools: [...reorderedKeys.tools].reverse() };

		expect(createPromptCacheDiagnostics(reorderedKeys).toolsHash).toBe(createPromptCacheDiagnostics(base).toolsHash);
		expect(createPromptCacheDiagnostics(reversedTools).toolsHash).not.toBe(
			createPromptCacheDiagnostics(base).toolsHash,
		);
	});

	it("classifies append-only conversations and isolates changed prefix segments", () => {
		const firstContext: Context = {
			systemPrompt: "Stable prefix\n\nvolatile tail",
			systemPromptStableLength: "Stable prefix".length,
			messages: [{ role: "user", content: "first request", timestamp: 1 }],
			tools: context().tools,
		};
		const first = createPromptCacheDiagnostics(firstContext);
		expect(first.prefixStatus).toBe("initial");

		const previousResponse = assistantMessage();
		previousResponse.usage.promptCache = first;
		const continued: Context = {
			...firstContext,
			messages: [
				...firstContext.messages,
				previousResponse,
				{ role: "user", content: "next request", timestamp: 3 },
			],
		};
		const extended = createPromptCacheDiagnostics(continued);
		expect(extended.prefixStatus).toBe("extended");
		expect(extended.changedSegments).toEqual([]);

		const volatileChanged = createPromptCacheDiagnostics({
			...continued,
			systemPrompt: "Stable prefix\n\na different volatile tail",
		});
		expect(volatileChanged.prefixStatus).toBe("extended");
		expect(volatileChanged.changedSegments).toEqual(["volatile-system"]);

		const stableChanged = createPromptCacheDiagnostics({
			...continued,
			systemPrompt: "Changed prefix\n\nvolatile tail",
			systemPromptStableLength: "Changed prefix".length,
		});
		expect(stableChanged.prefixStatus).toBe("changed");
		expect(stableChanged.changedSegments).toEqual(["stable-system"]);

		const toolsChanged = createPromptCacheDiagnostics({
			...continued,
			tools: [...(continued.tools ?? [])].reverse(),
		});
		expect(toolsChanged.prefixStatus).toBe("changed");
		expect(toolsChanged.changedSegments).toEqual(["tools"]);

		const messagesChanged = createPromptCacheDiagnostics({
			...continued,
			messages: [{ role: "user", content: "rewritten", timestamp: 1 }, ...continued.messages.slice(1)],
		});
		expect(messagesChanged.prefixStatus).toBe("changed");
		expect(messagesChanged.changedSegments).toEqual(["messages"]);
	});

	it("marks historical diagnostics without lineage fields as unknown", () => {
		const previousResponse = assistantMessage();
		previousResponse.usage.promptCache = createPromptCacheDiagnostics({ messages: [] });
		delete previousResponse.usage.promptCache.requestMessagesHash;
		delete previousResponse.usage.promptCache.requestMessageCount;

		const diagnostics = createPromptCacheDiagnostics({
			messages: [previousResponse, { role: "user", content: "next", timestamp: 3 }],
		});

		expect(diagnostics.prefixStatus).toBe("unknown");
		expect(diagnostics.changedSegments).toEqual([]);
	});

	it("identifies exact prompt blocks and tools without retaining their contents", () => {
		const firstContext: Context = {
			systemPrompt: "stable secret\n\nvolatile secret",
			systemPromptStableLength: "stable secret".length,
			promptCacheSystemPromptBlocks: [
				{ id: "core.identity", start: 0, length: "stable secret".length, cacheability: "stable" },
				{
					id: "plugin.router",
					start: "stable secret\n\n".length,
					length: "volatile secret".length,
					cacheability: "volatile",
				},
			],
			messages: [{ role: "user", content: "first request", timestamp: 1 }],
			tools: [
				{ name: "read", description: "private read description", parameters: Type.Object({ path: Type.String() }) },
				{ name: "write", description: "write", parameters: Type.Object({ path: Type.String() }) },
			],
		};
		const first = createPromptCacheDiagnostics(firstContext);
		const previousResponse = assistantMessage();
		previousResponse.usage.promptCache = first;

		const second = createPromptCacheDiagnostics({
			...firstContext,
			systemPrompt: "stable secret\n\nchanged volatile secret",
			promptCacheSystemPromptBlocks: [
				firstContext.promptCacheSystemPromptBlocks![0]!,
				{
					id: "plugin.router",
					start: "stable secret\n\n".length,
					length: "changed volatile secret".length,
					cacheability: "volatile",
				},
			],
			messages: [...firstContext.messages, previousResponse, { role: "user", content: "next", timestamp: 3 }],
			tools: [
				{ name: "read", description: "changed read description", parameters: Type.Object({ path: Type.String() }) },
				{ name: "search", description: "search", parameters: Type.Object({ query: Type.String() }) },
			],
		});

		expect(second.changedSystemPromptBlocks).toEqual([{ id: "plugin.router", change: "changed" }]);
		expect(second.changedTools).toEqual([
			{ id: "read", change: "changed" },
			{ id: "search", change: "added" },
			{ id: "write", change: "removed" },
		]);
		expect(second.systemPromptBlocks?.map((block) => block.id)).toEqual(["core.identity", "plugin.router"]);
		expect(second.toolDefinitions?.map((tool) => tool.name)).toEqual(["read", "search"]);
		const serialized = JSON.stringify(second);
		expect(serialized).not.toContain("stable secret");
		expect(serialized).not.toContain("changed volatile secret");
		expect(serialized).not.toContain("changed read description");
	});

	it("omits block-level diagnostics when spans are invalid", () => {
		const diagnostics = createPromptCacheDiagnostics({
			systemPrompt: "short",
			promptCacheSystemPromptBlocks: [{ id: "invalid", start: 3, length: 10, cacheability: "volatile" }],
			messages: [],
		});

		expect(diagnostics.systemPromptBlocks).toBeUndefined();
	});
});

// 指纹会随 usage 持久化，下一次调用拿它判断前缀是否延续；实现怎么优化都不能改变已发布的哈希值。
describe("prompt cache fingerprint compatibility", () => {
	it("keeps the published pc1 hashes for a conversation with images and tool calls", () => {
		const tools: Context["tools"] = [
			{
				name: "read",
				description: "Read",
				parameters: Type.Object({ a: Type.String() }),
			},
		];
		const messages: Context["messages"] = [
			{
				role: "user",
				content: [
					{ type: "text", text: "look" },
					{ type: "image", mimeType: "image/png", data: "aW1hZ2UtYnl0ZXM=" },
				],
				timestamp: 1,
			},
			{
				...assistantMessage(),
				content: [
					{ type: "text", text: "我看到了" },
					{ type: "toolCall", id: "call-1", name: "read", arguments: { a: "x" } },
				],
				stopReason: "toolUse",
			},
			{
				role: "toolResult",
				toolCallId: "call-1",
				toolName: "read",
				content: [{ type: "text", text: "result" }],
				isError: false,
				timestamp: 3,
			},
		];
		const systemPrompt = "Stable prefix\n\nvolatile tail";
		const first = createPromptCacheDiagnostics({ systemPrompt, systemPromptStableLength: 13, messages, tools });
		const assistant = messages[1] as AssistantMessage;
		messages[1] = { ...assistant, usage: { ...assistant.usage, promptCache: first } };
		messages.push(
			{ ...assistantMessage(), content: [{ type: "text", text: "done" }], timestamp: 4 },
			{ role: "user", content: "next", timestamp: 5 },
		);
		const second = createPromptCacheDiagnostics({ systemPrompt, systemPromptStableLength: 13, messages, tools });

		expect(first).toMatchObject({
			cachePrefixHash: "pc1:e883e138e77d59bc",
			stableSystemPromptHash: "pc1:8241486c54615310",
			volatileSystemPromptHash: "pc1:e6b2ca3da5b75699",
			toolsHash: "pc1:aaa329f8019d26b4",
			historyPrefixHash: "pc1:3c5018e0c4d3ec14",
			requestMessagesHash: "pc1:b1a44a1aba33138e",
			toolDefinitions: [{ name: "read", hash: "pc1:cfc3c078bae4169c" }],
			prefixStatus: "initial",
		});
		expect(second).toMatchObject({
			cachePrefixHash: "pc1:d1e98fa02bd8b1a4",
			historyPrefixHash: "pc1:d2f87d8b56df88e7",
			requestMessagesHash: "pc1:085e932c22208f98",
			requestMessageCount: 5,
			historyPrefixMessages: 4,
			prefixStatus: "extended",
			changedSegments: [],
		});
	});
});

function context(): Context {
	return {
		systemPrompt: "Stable prefix\n\nvolatile tail",
		systemPromptStableLength: "Stable prefix".length,
		messages: [
			{ role: "user", content: "first", timestamp: 1 },
			assistantMessage(),
			{
				role: "toolResult",
				toolCallId: "call-1",
				toolName: "read",
				content: [{ type: "text", text: "result" }],
				details: { local: true },
				isError: false,
				timestamp: 3,
			},
			{ role: "user", content: "current request", timestamp: 4 },
		],
		tools: [
			{ name: "read", description: "Read", parameters: Type.Object({ a: Type.String(), b: Type.Number() }) },
			{ name: "write", description: "Write", parameters: Type.Object({ path: Type.String() }) },
		],
	};
}

function assistantMessage(): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text: "response" }],
		api: "openai-responses",
		provider: "test",
		model: "test",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: 2,
	};
}
