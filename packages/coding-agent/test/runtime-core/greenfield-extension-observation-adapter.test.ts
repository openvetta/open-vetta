import type { AssistantMessage } from "@vetta/ai";
import { describe, expect, it } from "vitest";
import {
	CodingAgentGreenfieldExtensionObservationAdapter,
	type CodingAgentGreenfieldObservedExtensionEvent,
} from "../../src/adapters/runtime-core/greenfield-extension-observation-adapter.js";

describe("CodingAgentGreenfieldExtensionObservationAdapter", () => {
	it("preserves lifecycle order, turn indexes, timestamps and turn payloads", async () => {
		const events: CodingAgentGreenfieldObservedExtensionEvent[] = [];
		const adapter = new CodingAgentGreenfieldExtensionObservationAdapter(async (event) => {
			events.push(event);
		});
		const message = assistantMessage();

		await adapter.observe({ turnId: "turn-1", timestamp: 10, event: { type: "agent.start" } });
		await adapter.observe({ turnId: "turn-1", timestamp: 11, event: { type: "turn.start" } });
		await adapter.observe({
			turnId: "turn-1",
			timestamp: 12,
			event: { type: "turn.end", message, toolResults: [] },
		});
		await adapter.observe({ turnId: "turn-1", timestamp: 13, event: { type: "turn.start" } });
		await adapter.observe({
			turnId: "turn-1",
			timestamp: 14,
			event: { type: "turn.end", message, toolResults: [] },
		});

		expect(events).toEqual([
			{ type: "agent_start" },
			{ type: "turn_start", turnIndex: 0, timestamp: 11 },
			{ type: "turn_end", turnIndex: 0, message, toolResults: [] },
			{ type: "turn_start", turnIndex: 1, timestamp: 13 },
			{ type: "turn_end", turnIndex: 1, message, toolResults: [] },
		]);
	});

	it("preserves complete tool execution payloads", async () => {
		const events: CodingAgentGreenfieldObservedExtensionEvent[] = [];
		const adapter = new CodingAgentGreenfieldExtensionObservationAdapter(async (event) => {
			events.push(event);
		});
		const result = { content: [{ type: "text" as const, text: "done" }], details: { ok: true } };

		await adapter.observe({
			turnId: "turn-1",
			timestamp: 1,
			event: {
				type: "tool.execution.start",
				toolCallId: "call-1",
				toolName: "read",
				args: { path: "README.md" },
				startedAt: 100,
			},
		});
		await adapter.observe({
			turnId: "turn-1",
			timestamp: 2,
			event: {
				type: "tool.execution.update",
				toolCallId: "call-1",
				toolName: "read",
				args: { path: "README.md" },
				partialResult: result,
			},
		});
		await adapter.observe({
			turnId: "turn-1",
			timestamp: 3,
			event: {
				type: "tool.execution.phase",
				toolCallId: "call-1",
				toolName: "read",
				label: "reading",
				atMs: 4,
			},
		});
		await adapter.observe({
			turnId: "turn-1",
			timestamp: 4,
			event: {
				type: "tool.execution.end",
				toolCallId: "call-1",
				toolName: "read",
				result,
				isError: false,
				startedAt: 100,
				durationMs: 8,
				phases: [{ label: "reading", atMs: 4 }],
			},
		});

		expect(events).toEqual([
			{
				type: "tool_execution_start",
				toolCallId: "call-1",
				toolName: "read",
				args: { path: "README.md" },
				startedAt: 100,
			},
			{
				type: "tool_execution_update",
				toolCallId: "call-1",
				toolName: "read",
				args: { path: "README.md" },
				partialResult: result,
			},
			{
				type: "tool_execution_phase",
				toolCallId: "call-1",
				toolName: "read",
				label: "reading",
				atMs: 4,
			},
			{
				type: "tool_execution_end",
				toolCallId: "call-1",
				toolName: "read",
				result,
				isError: false,
				startedAt: 100,
				durationMs: 8,
				phases: [{ label: "reading", atMs: 4 }],
			},
		]);
	});
});

function assistantMessage(): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text: "done" }],
		api: "openai-responses",
		provider: "test",
		model: "test-model",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: 1,
	};
}
