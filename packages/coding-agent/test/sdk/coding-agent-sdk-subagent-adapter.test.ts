import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@vetta/agent-core";
import type { Api, Model, UserMessage } from "@vetta/ai";
import type { RuntimeToolResult } from "@vetta/runtime-core/kernel";
import type { SubagentSnapshot } from "@vetta/runtime-subagents";
import { describe, expect, it, vi } from "vitest";
import { AuthStorage } from "../../src/core/auth-storage.js";
import { ModelRegistry } from "../../src/core/model-registry.js";
import {
	createEmptySubagentTypeRegistry,
	type SubagentChildHandle as LegacySubagentChildHandle,
	type SubagentTypeDefinition as LegacySubagentTypeDefinition,
	type SubagentSessionFactory,
} from "../../src/core/subagents/index.js";
import { adaptCodingAgentSdkSubagents } from "../../src/host/coding-agent-sdk-subagent-adapter.js";

describe("Coding Agent SDK subagent adapter", () => {
	it("reads the Legacy registry live and preserves custom tool execution metadata", async () => {
		const registry = createEmptySubagentTypeRegistry();
		const adapters = adaptCodingAgentSdkSubagents({
			typeRegistry: registry,
			modelRegistry: new ModelRegistry(AuthStorage.inMemory(), undefined),
		});
		if (!adapters) throw new Error("Expected SDK subagent adapters");

		expect(adapters.typeRegistry.ids()).toEqual([]);
		const execute = vi.fn<AgentTool["execute"]>(async (_id, input, signal, onUpdate, context) => {
			context?.phase("legacy-phase");
			onUpdate?.({ content: [{ type: "text", text: "partial" }], details: { partial: true } });
			const value =
				typeof input === "object" && input !== null && typeof Reflect.get(input, "value") === "string"
					? Reflect.get(input, "value")
					: "invalid";
			return {
				content: [{ type: "text" as const, text: `${value}:${signal?.aborted === false}` }],
				details: { complete: true },
			};
		});
		const reviewTool: AgentTool = {
			name: "review_code",
			label: "Review code",
			description: "Review code",
			parameters: Type.Object({ value: Type.String() }),
			scope_use: ["cli"],
			execute,
		};
		registry.register(
			customType({
				createBuiltinTools: () => [reviewTool],
			}),
		);

		const mapped = adapters.typeRegistry.get("reviewer");
		const registration = mapped?.profile.createRuntimeTools?.("C:\\workspace")[0];
		if (!registration) throw new Error("Expected mapped custom runtime tool");
		const updates: RuntimeToolResult[] = [];
		const phases: string[] = [];
		const signal = new AbortController().signal;
		await expect(
			registration.tool.execute({
				sessionId: "child",
				turnId: "turn-1",
				toolCallId: "call-1",
				input: { value: "ok" },
				signal,
				onUpdate: (update) => updates.push(update),
				reportPhase: (phase) => phases.push(phase),
			}),
		).resolves.toEqual({
			content: [{ type: "text", text: "ok:true" }],
			details: { complete: true },
		});
		expect(updates).toEqual([{ content: [{ type: "text", text: "partial" }], details: { partial: true } }]);
		expect(phases).toEqual(["legacy-phase"]);
		expect(mapped?.profile).toMatchObject({
			activation: { mode: "explicit", toolNames: [] },
			forkParentContext: true,
			includeTodo: true,
		});
	});

	it("adapts an explicit Legacy child factory at the SDK Host edge", async () => {
		const registry = createEmptySubagentTypeRegistry().register(customType());
		const close = vi.fn(async () => {});
		const dispose = vi.fn();
		const create = vi.fn<SubagentSessionFactory["create"]>(async () => legacyChild({ close, dispose }));
		const reopen = vi.fn<NonNullable<SubagentSessionFactory["reopen"]>>(async () => legacyChild({ close, dispose }));
		const modelRegistry = new ModelRegistry(AuthStorage.inMemory(), undefined);
		const adapters = adaptCodingAgentSdkSubagents({
			typeRegistry: registry,
			sessionFactory: { create, reopen },
			modelRegistry,
			agentDir: "C:\\agent",
		});
		if (!adapters?.createChildFactory) throw new Error("Expected explicit child factory adapter");
		const mcpPhases: string[] = [];
		const mcpUpdates: RuntimeToolResult[] = [];
		const mcpExecute = vi.fn(async (request) => {
			request.reportPhase?.("mcp-phase");
			request.onUpdate?.({ content: [{ type: "text", text: "partial" }], details: undefined });
			return { content: [{ type: "text" as const, text: String(request.input.value) }], details: undefined };
		});
		const factory = adapters.createChildFactory({
			cwd: "C:\\workspace",
			scenario: "project",
			readParentSessionId: () => "parent",
			readParentSessionPath: () => "C:\\sessions\\parent.jsonl",
			readModel: () => MODEL,
			readThinkingLevel: () => "high",
			readInheritedMcpView: async () => ({
				tools: [
					{
						fingerprint: "mcp-1",
						tool: {
							name: "mcp_search",
							label: "MCP search",
							description: "Search through MCP",
							inputSchema: Type.Object({ value: Type.String() }),
							execute: mcpExecute,
						},
					},
				],
			}),
		});
		const type = adapters.typeRegistry.get("reviewer");
		if (!type) throw new Error("Expected mapped reviewer type");
		const signal = new AbortController().signal;
		const forkContext: readonly UserMessage[] = [{ role: "user", content: "parent context", timestamp: 1 }];
		const child = await factory.create(
			{ taskName: "review", message: "Review", agentType: "reviewer", todos: ["Inspect"] },
			type,
			forkContext,
			signal,
		);

		expect(create).toHaveBeenCalledOnce();
		const [request, parent, legacyType, receivedSignal] = create.mock.calls[0];
		expect(request).toMatchObject({ taskName: "review", todos: ["Inspect"] });
		expect(parent).toMatchObject({
			parentSessionId: "parent",
			parentSessionFile: "C:\\sessions\\parent.jsonl",
			cwd: "C:\\workspace",
			scenario: "project",
			model: MODEL,
			thinkingLevel: "high",
			agentDir: "C:\\agent",
			modelRegistry,
			forkContextMessages: forkContext,
		});
		expect(legacyType).toBe(registry.get("reviewer"));
		expect(receivedSignal).toBe(signal);

		await parent.parentMcpTools[0].execute(
			"mcp-call",
			{ value: "result" },
			signal,
			(update) => mcpUpdates.push(update),
			{ phase: (phase) => mcpPhases.push(phase) },
		);
		expect(mcpExecute).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "parent", signal }));
		expect(mcpUpdates).toEqual([{ content: [{ type: "text", text: "partial" }], details: undefined }]);
		expect(mcpPhases).toEqual(["mcp-phase"]);
		await child.dispose();
		expect(close).toHaveBeenCalledOnce();
		expect(dispose).not.toHaveBeenCalled();

		await factory.reopen?.(snapshot(), type, undefined, signal);
		expect(reopen).toHaveBeenCalledWith(
			expect.objectContaining({ id: "child" }),
			expect.objectContaining({ parentSessionId: "parent" }),
			registry.get("reviewer"),
			signal,
		);
	});
});

function customType(overrides: Partial<LegacySubagentTypeDefinition> = {}): LegacySubagentTypeDefinition {
	return {
		id: "reviewer",
		label: "Reviewer",
		description: "Review code",
		createBuiltinTools: () => [],
		inheritParentMcp: true,
		systemPromptAddon: "Review only.",
		forkParentContext: true,
		includeTodoTool: true,
		...overrides,
	};
}

function legacyChild(options: {
	readonly close: () => Promise<void>;
	readonly dispose: () => void;
}): LegacySubagentChildHandle {
	return {
		sessionId: "child",
		sessionFile: "C:\\sessions\\child.jsonl",
		async prompt() {},
		async sendMessage() {},
		async followUp() {},
		abort() {},
		async waitForIdle() {},
		isStreaming: () => false,
		getLastAssistantText: () => "done",
		dispose: options.dispose,
		close: options.close,
		subscribe: () => () => {},
	};
}

function snapshot(): SubagentSnapshot {
	return {
		id: "child",
		taskName: "review",
		path: "/root/review",
		agentType: "reviewer",
		status: "completed",
		task: "Review",
		parentSessionId: "parent",
		sessionFile: "C:\\sessions\\child.jsonl",
		startedAt: 1,
		endedAt: 2,
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costTotal: 0 },
		generation: 1,
	};
}

const MODEL: Model<Api> = {
	id: "sdk-subagent-model",
	name: "SDK Subagent Model",
	api: "openai-responses",
	provider: "test",
	baseUrl: "https://example.test",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8_000,
	maxTokens: 1_000,
};
