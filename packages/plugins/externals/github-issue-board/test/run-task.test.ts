import { describe, expect, it, vi } from "vitest";
import type { ConversationEvent, PluginConversationApi, SendPromptResult } from "@vetta-org/plugin-sdk";
import { addManualTask, EMPTY_STATE, type PluginState } from "../src/state";
import { runQueuedTask } from "../src/run-task";

function queuedState(...prompts: string[]): PluginState {
	return prompts.reduce(
		(state, promptText, index) => addManualTask(state, { id: `task-${index + 1}`, promptText, now: index + 1 }),
		EMPTY_STATE,
	);
}

function fakeConversation(options?: {
	id?: string | null;
	sessionPath?: string | null;
	createError?: Error;
	sendError?: Error;
	sendResult?: SendPromptResult;
	stopReason?: string;
}) {
	const listeners = new Set<(event: ConversationEvent) => void>();
	const emit = (event: ConversationEvent): void => {
		for (const listener of listeners) listener(event);
	};
	const createSession = vi.fn(async (cwd: string) => {
		if (options?.createError) throw options.createError;
		return {
			id: options?.id === undefined ? "sess-1" : options.id,
			cwd,
			sessionPath: options?.sessionPath === undefined ? "/tmp/sess-1.jsonl" : options.sessionPath,
			model: null,
			isStreaming: false,
		};
	});
	const sendPrompt = vi.fn(async () => {
		if (options?.sendError) throw options.sendError;
		if (options?.stopReason) emit({ type: "turn-end", stopReason: options.stopReason });
		return options?.sendResult ?? { status: "sent" as const };
	});
	const conversation = {
		createSession,
		sendPrompt,
		insertText: () => undefined,
		abort: async () => undefined,
		on: (listener: (event: ConversationEvent) => void) => {
			listeners.add(listener);
			return { dispose: () => listeners.delete(listener) };
		},
	} as unknown as PluginConversationApi;
	return { conversation, createSession, sendPrompt };
}

describe("runQueuedTask", () => {
	it("marks the task completed when the turn ends with stop", async () => {
		const { conversation, createSession, sendPrompt } = fakeConversation({ stopReason: "stop" });
		const result = await runQueuedTask({
			state: queuedState("Fix the login button"),
			taskId: "task-1",
			conversation,
			cwd: "/repo",
			now: () => 42,
		});

		expect(createSession).toHaveBeenCalledWith("/repo");
		expect(sendPrompt).toHaveBeenCalledWith("Fix the login button");
		expect(result.notice).toBeNull();
		expect(result.state.tasks[0]).toMatchObject({
			status: "completed",
			sessionId: "sess-1",
			updatedAt: 42,
		});
	});

	it("marks the task failed with the stop reason when the turn does not stop cleanly", async () => {
		const { conversation } = fakeConversation({ stopReason: "aborted" });
		const result = await runQueuedTask({
			state: queuedState("Fix the login button"),
			taskId: "task-1",
			conversation,
			cwd: "/repo",
			now: () => 7,
		});

		expect(result.notice).toBeNull();
		expect(result.state.tasks[0]).toMatchObject({
			status: "failed",
			sessionId: "sess-1",
			error: "aborted",
			updatedAt: 7,
		});
	});

	it("marks the task failed when createSession or sendPrompt throws", async () => {
		const createFail = fakeConversation({ createError: new Error("cannot open session") });
		const created = await runQueuedTask({
			state: queuedState("Fix the login button"),
			taskId: "task-1",
			conversation: createFail.conversation,
			cwd: "/repo",
			now: () => 3,
		});
		expect(createFail.sendPrompt).not.toHaveBeenCalled();
		expect(created.state.tasks[0]).toMatchObject({
			status: "failed",
			error: "cannot open session",
		});

		const sendFail = fakeConversation({ sendError: new Error("prompt rejected") });
		const sent = await runQueuedTask({
			state: queuedState("Fix the login button"),
			taskId: "task-1",
			conversation: sendFail.conversation,
			cwd: "/repo",
			now: () => 4,
		});
		expect(sendFail.createSession).toHaveBeenCalled();
		expect(sent.state.tasks[0]).toMatchObject({
			status: "failed",
			sessionId: "sess-1",
			error: "prompt rejected",
		});
	});

	it("refuses to start a session and asks to open a project when cwd is missing", async () => {
		const { conversation, createSession, sendPrompt } = fakeConversation();
		const result = await runQueuedTask({
			state: queuedState("Fix the login button"),
			taskId: "task-1",
			conversation,
			cwd: null,
			now: () => 1,
		});

		expect(createSession).not.toHaveBeenCalled();
		expect(sendPrompt).not.toHaveBeenCalled();
		expect(result.notice).toBe("no-project");
		expect(result.state.tasks[0]?.status).toBe("pending");
	});
});
