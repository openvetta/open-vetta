import type { AssistantMessage } from "@vetta/ai";
import type { AgentSession, AgentSessionEvent } from "@vetta/coding-agent";
import { mapAgentSessionEvent, mapAgentSessionEventToObservations } from "@vetta/coding-agent/runtime-host";
import { describe, expect, it, vi } from "vitest";
import type { SessionEvent } from "../../src/contracts.js";

function assistantMessage(stopReason: AssistantMessage["stopReason"] = "stop"): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text: stopReason === "error" ? "provider failed" : "done" }],
		api: "openai-responses",
		provider: "openai",
		model: "test-model",
		usage: {
			input: 10,
			output: 4,
			cacheRead: 2,
			cacheWrite: 1,
			totalTokens: 17,
			cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 },
		},
		stopReason,
		timestamp: 1,
	};
}

function createLegacySessionDouble() {
	const appendCustomEntry = vi.fn();
	const session = {
		getContextUsage: () => ({ percent: 25, contextWindow: 8_000 }),
		sessionManager: { appendCustomEntry },
	} as unknown as AgentSession;
	return { session, appendCustomEntry };
}

function payload(event: SessionEvent): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(event).filter(([key]) => !["schemaVersion", "sessionId", "eventId", "timestamp"].includes(key)),
	);
}

describe("legacy AgentSessionEvent characterization", () => {
	it("preserves lifecycle mapping and assistant turn timing persistence", () => {
		const now = vi.spyOn(Date, "now").mockReturnValueOnce(100).mockReturnValueOnce(150);
		const { session, appendCustomEntry } = createLegacySessionDouble();
		const state = { currentTurnStartedAt: new Map<string, number>() };

		const started = mapAgentSessionEvent("session-1", { type: "agent_start" }, session, state);
		const ended = mapAgentSessionEvent(
			"session-1",
			{ type: "agent_end", messages: [assistantMessage()] },
			session,
			state,
		);

		expect(started.map(payload)).toEqual([
			{ source: "runtime-core", type: "session.lifecycle", phase: "agent_start" },
		]);
		expect(ended.map(payload)).toEqual([{ source: "runtime-core", type: "session.lifecycle", phase: "agent_end" }]);
		expect(appendCustomEntry).toHaveBeenCalledWith("vetta.assistant_turn_timing", {
			startedAt: 100,
			endedAt: 150,
			durationMs: 50,
		});
		now.mockRestore();
	});

	it("preserves streaming deltas and tool-call generation", () => {
		const { session } = createLegacySessionDouble();
		const state = { currentTurnStartedAt: new Map<string, number>() };
		const message = assistantMessage();
		const events: AgentSessionEvent[] = [
			{
				type: "message_update",
				message,
				assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "hello", partial: message },
			},
			{
				type: "message_update",
				message,
				assistantMessageEvent: {
					type: "thinking_delta",
					contentIndex: 0,
					delta: "reasoning",
					partial: message,
				},
			},
			{
				type: "message_update",
				message,
				assistantMessageEvent: {
					type: "toolcall_start",
					contentIndex: 0,
					partial: assistantMessageWithToolCall(),
				},
			},
		];

		const mapped = events.flatMap((event) => mapAgentSessionEvent("session-1", event, session, state));

		expect(mapped.map(payload)).toEqual([
			{ source: "agent", type: "message.delta", delta: "hello" },
			{ source: "agent", type: "thinking.delta", delta: "reasoning" },
			{ source: "agent", type: "toolcall.start", toolCallId: "call-1", toolName: "read" },
		]);
	});

	it("preserves assistant final, usage, provider error and abort semantics", () => {
		const { session } = createLegacySessionDouble();
		const state = { currentTurnStartedAt: new Map<string, number>() };

		const completed = mapAgentSessionEvent(
			"session-1",
			{ type: "message_end", message: assistantMessage() },
			session,
			state,
		);
		const failed = mapAgentSessionEvent(
			"session-1",
			{ type: "message_end", message: assistantMessage("error") },
			session,
			state,
		);
		const aborted = mapAgentSessionEvent(
			"session-1",
			{ type: "message_end", message: assistantMessage("aborted") },
			session,
			state,
		);

		expect(completed.map((event) => event.type)).toEqual(["message.final", "usage.update"]);
		expect(payload(completed[1])).toEqual({
			source: "agent",
			type: "usage.update",
			input: 10,
			output: 4,
			cacheRead: 2,
			cacheWrite: 1,
			costTotal: 10,
			contextPercent: 25,
			contextWindow: 8_000,
		});
		expect(failed.map((event) => event.type)).toEqual(["message.final", "usage.update", "error"]);
		expect(payload(failed[2])).toMatchObject({
			source: "agent",
			type: "error",
			error: { message: "provider failed", retryable: true, origin: "provider" },
		});
		expect(aborted.map((event) => event.type)).toEqual(["message.final", "usage.update", "session.lifecycle"]);
		expect(payload(aborted[2])).toMatchObject({ phase: "aborted", source: "runtime-core" });
	});

	it("preserves tool execution lifecycle fields", () => {
		const { session } = createLegacySessionDouble();
		const state = { currentTurnStartedAt: new Map<string, number>() };
		const events: AgentSessionEvent[] = [
			{ type: "tool_execution_start", toolCallId: "call-1", toolName: "read", args: { path: "a" }, startedAt: 10 },
			{
				type: "tool_execution_update",
				toolCallId: "call-1",
				toolName: "read",
				args: { path: "a" },
				partialResult: { text: "working" },
			},
			{ type: "tool_execution_phase", toolCallId: "call-1", toolName: "read", label: "reading", atMs: 5 },
			{
				type: "tool_execution_end",
				toolCallId: "call-1",
				toolName: "read",
				result: { text: "done" },
				isError: false,
				startedAt: 10,
				durationMs: 20,
				phases: [{ label: "reading", atMs: 5 }],
			},
		];

		const mapped = events.flatMap((event) => mapAgentSessionEvent("session-1", event, session, state));

		expect(mapped.map(payload)).toEqual([
			{
				source: "tool",
				type: "tool.start",
				toolCallId: "call-1",
				toolName: "read",
				args: { path: "a" },
				startedAt: 10,
			},
			{
				source: "tool",
				type: "tool.update",
				toolCallId: "call-1",
				toolName: "read",
				partialResult: { text: "working" },
			},
			{
				source: "tool",
				type: "tool.phase",
				toolCallId: "call-1",
				toolName: "read",
				label: "reading",
				atMs: 5,
			},
			{
				source: "tool",
				type: "tool.end",
				toolCallId: "call-1",
				toolName: "read",
				isError: false,
				result: { text: "done" },
				startedAt: 10,
				durationMs: 20,
				phases: [{ label: "reading", atMs: 5 }],
			},
		]);
	});

	it("preserves capability, compaction, MCP and retry events", () => {
		const { session } = createLegacySessionDouble();
		const state = { currentTurnStartedAt: new Map<string, number>() };
		const events = [
			{ type: "todo_update", items: [{ id: 1, content: "work", status: "pending" }] },
			{
				type: "background_tasks_update",
				tasks: [
					{
						id: "task-1",
						command: "echo ok",
						cwd: "C:/work",
						status: "running",
						outputFile: "C:/work/out.log",
						exitCode: undefined,
						startedAt: 1,
						tail: "",
					},
				],
			},
			{
				type: "subagents_update",
				agents: [
					{
						id: "agent-1",
						taskName: "review",
						path: "/root/review",
						agentType: "explorer",
						status: "running",
						task: "review code",
						parentSessionId: "session-1",
						startedAt: 1,
						generation: 1,
					},
				],
			},
			{ type: "auto_compaction_start", reason: "threshold" },
			{ type: "auto_compaction_end", result: {}, aborted: false, willRetry: false },
			{ type: "mcp_reload_start" },
			{ type: "mcp_reload_end", changed: true },
			{ type: "auto_retry_start", attempt: 1, maxAttempts: 3, delayMs: 100, errorMessage: "retry" },
		] as AgentSessionEvent[];

		const observations = events.flatMap((event) =>
			mapAgentSessionEventToObservations("session-1", event, session, state),
		);

		expect(observations.map((event) => event.type)).toEqual([
			"todo_update",
			"background_tasks_update",
			"subagents_update",
			"compaction.start",
			"compaction.end",
			"mcp.reload.start",
			"mcp.reload.end",
			"error",
		]);
	});
});

function assistantMessageWithToolCall(): AssistantMessage {
	return {
		...assistantMessage("toolUse"),
		content: [{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "a" } }],
	};
}
