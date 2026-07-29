import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeHost, SessionEvent } from "../../../../runtime-core/src/index.js";
import type { ScheduledTask, TaskExecutionRecord } from "./task-storage.js";

const mocks = vi.hoisted(() => ({
	createRecord: vi.fn(async (_record: TaskExecutionRecord) => {}),
	emitTaskEvent: vi.fn(),
	emitTaskStreamEvent: vi.fn(),
	ensureConversationSubCwd: vi.fn(async (cwd: string) => cwd),
	generateId: vi.fn(() => "record-1"),
	monitorRuntimeSession: vi.fn(),
	recordAutomationRunStarted: vi.fn(),
	updateRecordMetadata: vi.fn(async (_record: TaskExecutionRecord) => {}),
	updateTaskLastRun: vi.fn(async (_taskId: string, _status: "success" | "failed") => {}),
}));

vi.mock("../app-monitor/app-monitor-service.js", () => ({
	monitorRuntimeSession: mocks.monitorRuntimeSession,
	recordAutomationRunStarted: mocks.recordAutomationRunStarted,
}));
vi.mock("../execution-mode.js", () => ({
	resolveExecutionMode: () => "full-access",
}));
vi.mock("../ipc/fs.js", () => ({
	DEFAULT_CONVERSATION_CWD: "C:/desktop/conversations",
	DEFAULT_CONVERSATION_SESSION_DIR: "C:/desktop/conversations/.vetta/sessions",
	readDesktopConfig: async () => ({ defaultExecutionMode: "full-access" }),
}));
vi.mock("../ipc/scheduler.js", () => ({
	emitTaskEvent: mocks.emitTaskEvent,
	emitTaskStreamEvent: mocks.emitTaskStreamEvent,
}));
vi.mock("../ipc/session.js", () => ({
	ensureConversationSubCwd: mocks.ensureConversationSubCwd,
}));
vi.mock("../sandbox/capability.js", () => ({
	assertSandboxAvailableForMode: async () => {},
}));
vi.mock("./task-storage", () => ({
	createRecord: mocks.createRecord,
	generateId: mocks.generateId,
	updateRecordMetadata: mocks.updateRecordMetadata,
	updateTaskLastRun: mocks.updateTaskLastRun,
}));

import { executeTask, isTaskRunning } from "./task-executor.js";

describe("scheduler RuntimeHost consumer", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("maps one automation turn and records exactly one terminal result without disposing the shared session", async () => {
		const handlers = new Set<(event: SessionEvent) => void>();
		const createSession = vi.fn(async () => ({ sessionId: "automation-session" }));
		const renameSessionById = vi.fn();
		const disposeSession = vi.fn();
		const prompt = vi.fn(async () => {
			emit(handlers, messageDelta("automation-session", "scheduled response"));
			emit(handlers, toolCallStart("automation-session"));
			emit(handlers, toolStart("automation-session"));
			emit(handlers, toolEnd("automation-session"));
			emit(handlers, lifecycle("automation-session", "agent_end"));
		});
		const runtime = {
			createSession,
			renameSessionById,
			disposeSession,
			getSessionPath: () => "C:/desktop/conversations/.vetta/sessions/automation.jsonl",
			subscribe: (_sessionId: string, handler: (event: SessionEvent) => void) => {
				handlers.add(handler);
				return () => handlers.delete(handler);
			},
			prompt,
		} as unknown as RuntimeHost;
		const task = scheduledTask();

		await executeTask(task, runtime);
		await vi.waitFor(() => expect(mocks.updateRecordMetadata).toHaveBeenCalledOnce());

		expect(createSession).toHaveBeenCalledWith({
			cwd: task.cwd,
			scenario: "automation",
			executionMode: "full-access",
			sessionDir: "C:/desktop/conversations/.vetta/sessions",
		});
		expect(prompt).toHaveBeenCalledWith("automation-session", {
			text: task.prompt,
			modelKey: "test/provider-model",
			promptRef: { kind: "skill", name: "scheduled-skill" },
		});
		expect(mocks.createRecord).toHaveBeenCalledOnce();
		expect(mocks.updateTaskLastRun).toHaveBeenCalledOnce();
		expect(mocks.updateTaskLastRun).toHaveBeenCalledWith(task.id, "success");
		expect(mocks.updateRecordMetadata.mock.calls[0]?.[0]).toMatchObject({
			sessionId: "automation-session",
			status: "success",
			responsePreview: "scheduled response",
		});
		expect(mocks.emitTaskStreamEvent.mock.calls.map(([event]) => event.type)).toEqual([
			"message.delta",
			"toolcall.start",
			"tool.start",
			"tool.end",
			"session.lifecycle",
		]);
		expect(isTaskRunning(task.id)).toBe(false);
		expect(handlers.size).toBe(0);
		expect(disposeSession).not.toHaveBeenCalled();
	});
});

function scheduledTask(): ScheduledTask {
	return {
		id: "scheduled-task",
		name: "Scheduled Task",
		prompt: "Run the scheduled task",
		cron: "0 * * * *",
		isOnce: false,
		enabled: true,
		cwd: "C:/workspace/automation",
		modelKey: "test/provider-model",
		skill: { type: "skill", name: "scheduled-skill" },
		createdAt: 1,
		updatedAt: 1,
		lastRunAt: null,
		lastRunStatus: null,
	};
}

function emit(handlers: ReadonlySet<(event: SessionEvent) => void>, event: SessionEvent): void {
	for (const handler of handlers) handler(event);
}

function eventBase(sessionId: string) {
	return {
		schemaVersion: 1 as const,
		sessionId,
		eventId: `${sessionId}-event`,
		timestamp: 1,
		source: "runtime-core" as const,
	};
}

function lifecycle(sessionId: string, phase: "agent_end"): SessionEvent {
	return { ...eventBase(sessionId), type: "session.lifecycle", phase };
}

function messageDelta(sessionId: string, delta: string): SessionEvent {
	return { ...eventBase(sessionId), type: "message.delta", delta };
}

function toolCallStart(sessionId: string): SessionEvent {
	return {
		...eventBase(sessionId),
		type: "toolcall.start",
		toolCallId: "read-call",
		toolName: "read",
	};
}

function toolStart(sessionId: string): SessionEvent {
	return {
		...eventBase(sessionId),
		type: "tool.start",
		toolCallId: "read-call",
		toolName: "read",
		args: { path: "message.txt" },
		startedAt: 1,
	};
}

function toolEnd(sessionId: string): SessionEvent {
	return {
		...eventBase(sessionId),
		type: "tool.end",
		toolCallId: "read-call",
		toolName: "read",
		isError: false,
		result: "content",
		startedAt: 1,
		durationMs: 1,
		phases: [],
	};
}
