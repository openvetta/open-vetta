import { PassThrough } from "node:stream";
import { describe, expect, test, vi } from "vitest";
import { createRpcCommandDispatcher, type RpcFrameOutput } from "../../src/modes/rpc/rpc-command-dispatcher.js";
import { runRpcModeWithCapabilities } from "../../src/modes/rpc/rpc-mode.js";
import type { RpcSessionCapabilities, RpcSessionInitialization } from "../../src/modes/rpc/rpc-session-capabilities.js";
import type { RpcCommand, RpcResponse, RpcSessionState, RpcSlashCommand } from "../../src/modes/rpc/rpc-types.js";

describe("RPC command dispatcher", () => {
	test("dispatches the complete valid command surface through grouped capabilities", async () => {
		const session = createSessionCapabilities();
		const output = vi.fn<RpcFrameOutput>();
		const dispatch = createRpcCommandDispatcher(session, output);
		const commands: RpcCommand[] = [
			{ id: "prompt", type: "prompt", message: "hello", streamingBehavior: "steer" },
			{ id: "steer", type: "steer", message: "steer" },
			{ id: "follow", type: "follow_up", message: "follow" },
			{ id: "abort", type: "abort" },
			{ id: "new", type: "new_session", parentSession: "parent.jsonl" },
			{ id: "state", type: "get_state" },
			{ id: "model", type: "set_model", provider: "missing", modelId: "missing" },
			{ id: "cycle-model", type: "cycle_model" },
			{ id: "models", type: "get_available_models" },
			{ id: "thinking", type: "set_thinking_level", level: "high" },
			{ id: "cycle-thinking", type: "cycle_thinking_level" },
			{ id: "steering-mode", type: "set_steering_mode", mode: "one-at-a-time" },
			{ id: "follow-mode", type: "set_follow_up_mode", mode: "all" },
			{ id: "compact", type: "compact", customInstructions: "keep facts" },
			{ id: "auto-compact", type: "set_auto_compaction", enabled: false },
			{ id: "flush", type: "flush_memory" },
			{ id: "auto-retry", type: "set_auto_retry", enabled: false },
			{ id: "abort-retry", type: "abort_retry" },
			{ id: "bash", type: "bash", command: "echo ok" },
			{ id: "abort-bash", type: "abort_bash" },
			{ id: "stats", type: "get_session_stats" },
			{ id: "export", type: "export_html", outputPath: "out.html" },
			{ id: "switch", type: "switch_session", sessionPath: "other.jsonl" },
			{ id: "fork", type: "fork", entryId: "entry-1" },
			{ id: "fork-messages", type: "get_fork_messages" },
			{ id: "last-text", type: "get_last_assistant_text" },
			{ id: "name", type: "set_session_name", name: "  named  " },
			{ id: "messages", type: "get_messages" },
			{ id: "commands", type: "get_commands" },
		];

		const responses: RpcResponse[] = [];
		for (const command of commands) {
			responses.push(await dispatch(command));
		}

		expect(responses.map(({ command }) => command)).toEqual(commands.map(({ type }) => type));
		expect(responses.find(({ command }) => command === "set_model")).toMatchObject({
			success: false,
			error: "Model not found: missing/missing",
		});
		expect(responses.find(({ command }) => command === "flush_memory")).toMatchObject({
			success: true,
			data: { written: 3 },
		});
		expect(responses.find(({ command }) => command === "compact")).toMatchObject({
			success: true,
			data: { summary: "summary", firstKeptEntryId: "kept", tokensBefore: 42 },
		});
		expect(responses.find(({ command }) => command === "get_last_assistant_text")).toMatchObject({
			success: true,
			data: { text: undefined },
		});
		expect(session.session.setName).toHaveBeenCalledWith("named");
		expect(session.session.newSession).toHaveBeenCalledWith("parent.jsonl");
		expect(session.context.compact).toHaveBeenCalledWith("keep facts");
		expect(session.bash.execute).toHaveBeenCalledWith("echo ok");
		expect(output).not.toHaveBeenCalled();
	});

	test("acknowledges prompt immediately and reports its later failure as a correlated response", async () => {
		const session = createSessionCapabilities();
		session.turn.prompt = vi.fn(async () => {
			throw new Error("provider failed");
		});
		const frames: unknown[] = [];
		const dispatch = createRpcCommandDispatcher(session, (frame) => frames.push(frame));

		const response = await dispatch({ id: "p1", type: "prompt", message: "hello" });
		await Promise.resolve();

		expect(response).toEqual({ id: "p1", type: "response", command: "prompt", success: true });
		expect(frames).toEqual([
			{
				id: "p1",
				type: "response",
				command: "prompt",
				success: false,
				error: "provider failed",
			},
		]);
	});

	test("preserves empty session-name validation without invoking the session", async () => {
		const session = createSessionCapabilities();
		const dispatch = createRpcCommandDispatcher(session, () => {});

		await expect(dispatch({ id: "name", type: "set_session_name", name: "   " })).resolves.toEqual({
			id: "name",
			type: "response",
			command: "set_session_name",
			success: false,
			error: "Session name cannot be empty",
		});
		expect(session.session.setName).not.toHaveBeenCalled();
	});

	test("wires validated JSONL frames, session events and transport cleanup", async () => {
		const session = createSessionCapabilities();
		let initialization: RpcSessionInitialization | undefined;
		let eventListener: ((event: unknown) => void) | undefined;
		const unsubscribe = vi.fn();
		session.initialize = vi.fn(async (input) => {
			initialization = input;
		});
		session.subscribe = vi.fn((listener) => {
			eventListener = listener;
			return unsubscribe;
		});
		const input = new PassThrough();
		const output = new PassThrough();
		const chunks: Buffer[] = [];
		output.on("data", (chunk: Buffer) => chunks.push(chunk));
		const exit = vi.fn();

		void runRpcModeWithCapabilities(session, { input, output, exit });
		await vi.waitFor(() => expect(initialization).toBeDefined());

		input.write('{"id":"state","type":"get_state"}\n');
		await vi.waitFor(() => expect(readOutputFrames(chunks)).toHaveLength(1));
		input.write('{"id":"invalid","type":"prompt"}\n');
		await vi.waitFor(() => expect(readOutputFrames(chunks)).toHaveLength(2));
		input.write('{"type":"future_command"}\n');
		await vi.waitFor(() => expect(readOutputFrames(chunks)).toHaveLength(3));
		eventListener?.({ type: "agent_end" });
		await vi.waitFor(() => expect(readOutputFrames(chunks)).toHaveLength(4));

		expect(readOutputFrames(chunks)).toEqual([
			expect.objectContaining({ id: "state", command: "get_state", success: true }),
			expect.objectContaining({
				command: "parse",
				success: false,
				error: "Failed to parse command: Invalid RPC frame",
			}),
			expect.objectContaining({
				command: "future_command",
				success: false,
				error: "Unknown command: future_command",
			}),
			{ type: "agent_end" },
		]);

		input.end();
		await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
		expect(unsubscribe).toHaveBeenCalledOnce();
	});
});

function createSessionCapabilities(): RpcSessionCapabilities {
	return {
		turn: {
			prompt: vi.fn(async () => {}),
			steer: vi.fn(async () => {}),
			followUp: vi.fn(async () => {}),
			abort: vi.fn(async () => {}),
		},
		state: {
			readState: vi.fn(
				() =>
					({
						thinkingLevel: "medium",
						isStreaming: false,
						isCompacting: false,
						steeringMode: "all",
						followUpMode: "all",
						sessionId: "session-1",
						autoCompactionEnabled: true,
						messageCount: 0,
						pendingMessageCount: 0,
					}) satisfies RpcSessionState,
			),
			readMessages: vi.fn(() => []),
		},
		model: {
			selectModel: vi.fn(async () => undefined),
			cycleModel: vi.fn(async () => undefined),
			readAvailableModels: vi.fn(async () => []),
			setThinkingLevel: vi.fn(),
			cycleThinkingLevel: vi.fn(() => undefined),
		},
		queue: {
			setSteeringMode: vi.fn(),
			setFollowUpMode: vi.fn(),
		},
		context: {
			compact: vi.fn(async () => ({
				summary: "summary",
				firstKeptEntryId: "kept",
				tokensBefore: 42,
			})),
			setAutoCompactionEnabled: vi.fn(),
		},
		memory: {
			flushMemory: vi.fn(async () => 3),
		},
		retry: {
			setAutoRetryEnabled: vi.fn(),
			abortRetry: vi.fn(),
		},
		bash: {
			execute: vi.fn(async () => ({
				output: "ok",
				exitCode: 0,
				cancelled: false,
				truncated: false,
			})),
			abort: vi.fn(),
		},
		session: {
			newSession: vi.fn(async () => true),
			switchSession: vi.fn(async () => true),
			fork: vi.fn(async () => ({ text: "fork text", cancelled: false })),
			readForkMessages: vi.fn(() => [{ entryId: "entry-1", text: "prompt" }]),
			readLastAssistantText: vi.fn(() => undefined),
			setName: vi.fn(),
			readStats: vi.fn(() => ({
				sessionFile: "session.jsonl",
				sessionId: "session-1",
				userMessages: 1,
				assistantMessages: 1,
				toolCalls: 0,
				toolResults: 0,
				totalMessages: 2,
				tokens: {
					input: 1,
					output: 1,
					cacheRead: 0,
					cacheWrite: 0,
					total: 2,
				},
				cost: 0,
			})),
			exportHtml: vi.fn(async () => "out.html"),
		},
		commands: {
			readCommands: vi.fn(() => [{ name: "skill:test", source: "skill" }] satisfies RpcSlashCommand[]),
		},
		initialize: vi.fn(async () => {}),
		subscribe: vi.fn(() => () => {}),
		shutdown: vi.fn(async () => {}),
	};
}

function readOutputFrames(chunks: readonly Buffer[]): unknown[] {
	return Buffer.concat(chunks)
		.toString("utf8")
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}
