import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AssistantMessage } from "@vetta/ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeHost } from "../../../../runtime-core/src/index.js";
import type { BatchTaskState } from "./batch-task-state.js";
import type { BatchProject, BatchTask } from "./batch-task-storage.js";

const mocks = vi.hoisted(() => ({
	getTaskState: vi.fn(),
	saveTaskState: vi.fn(async (_projectId: string, _taskId: string, _state: BatchTaskState) => {}),
	verifyArtifacts: vi.fn(async () => ({ ok: true as const, matchedFiles: [] })),
	monitorRuntimeSession: vi.fn(),
	recordBatchRunStarted: vi.fn(),
}));

vi.mock("../app-monitor/app-monitor-service.js", () => ({
	monitorRuntimeSession: mocks.monitorRuntimeSession,
	recordBatchRunStarted: mocks.recordBatchRunStarted,
}));
vi.mock("../execution-mode.js", () => ({
	resolveExecutionMode: () => "full-access",
}));
vi.mock("../ipc/fs.js", () => ({
	readDesktopConfig: async () => ({ defaultExecutionMode: "full-access" }),
}));
vi.mock("../logger.js", () => ({
	getAppLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}),
}));
vi.mock("../sandbox/capability.js", () => ({
	assertSandboxAvailableForMode: async () => {},
}));
vi.mock("../webhook/index.js", () => ({
	getWebhookManager: () => ({ broadcast: vi.fn(async () => {}) }),
}));
vi.mock("./artifact-validator", () => ({
	verifyArtifacts: mocks.verifyArtifacts,
}));
vi.mock("./batch-task-state", () => ({
	getTaskState: mocks.getTaskState,
	saveTaskState: mocks.saveTaskState,
}));
vi.mock("./batch-task-storage", () => ({
	DEFAULT_BATCH_TIMEOUT_MINUTES: 60,
	getProject: async () => undefined,
}));
vi.mock("./notification-templates.js", () => ({
	buildProjectSummaryMessage: vi.fn(),
	buildTaskFinishedMessage: vi.fn(),
	isProjectFinished: () => false,
}));

import {
	type BatchTaskEvent,
	enqueueResumeTask,
	enqueueRunTask,
	getExecutingTaskIds,
	subscribeBatchTaskEvents,
} from "./batch-task-executor.js";

describe("batch RuntimeHost consumer", () => {
	const directories: string[] = [];

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(async () => {
		for (const directory of directories.splice(0).reverse()) {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("creates and finalizes one batch session without disposing the shared RuntimeHost session", async () => {
		const projectDir = await temporaryDirectory("desktop-batch-project-");
		const taskDir = await temporaryDirectory("desktop-batch-task-");
		const project = batchProject(projectDir);
		const task = batchTask(taskDir);
		project.tasks.push(task);
		const createSession = vi.fn(async () => ({ sessionId: "batch-session" }));
		const renameSessionById = vi.fn();
		const disposeSession = vi.fn();
		const prompt = vi.fn(async () => {});
		const runtime = {
			createSession,
			getSessionPath: () => join(projectDir, ".vetta", "sessions", "batch.jsonl"),
			getMessages: () => [assistantMessage("batch completed")],
			prompt,
			renameSessionById,
			disposeSession,
		} as unknown as RuntimeHost;
		const completed = waitForBatchEvent((event) => event.type === "task.completed" && event.taskId === task.id);

		enqueueRunTask(project, task, runtime);
		await completed;

		expect(createSession).toHaveBeenCalledWith({
			cwd: task.cwd,
			sessionDir: join(project.id, ".vetta", "sessions"),
			scenario: "batch",
			appendSystemPrompt: expect.stringContaining("## 批量任务上下文"),
			executionMode: "full-access",
			env: {
				TMPDIR: join(task.cwd, ".tmp"),
				TEMP: join(task.cwd, ".tmp"),
				TMP: join(task.cwd, ".tmp"),
			},
			enableBackgroundTasks: false,
		});
		expect(prompt).toHaveBeenCalledWith("batch-session", {
			text: project.prompt,
			modelKey: "test/provider-model",
			promptRef: { kind: "scene", name: "batch-scene" },
		});
		expect(renameSessionById).toHaveBeenCalledWith("batch-session", `${project.name}: ${task.name}`);
		expect(mocks.saveTaskState.mock.calls.map(([, , state]) => state.status)).toEqual(["running", "completed"]);
		await vi.waitFor(() => expect(getExecutingTaskIds()).not.toContain(task.id));
		expect(disposeSession).not.toHaveBeenCalled();
	});

	it("preserves the existing in-process paused-session resume behavior", async () => {
		const projectDir = await temporaryDirectory("desktop-batch-resume-project-");
		const taskDir = await temporaryDirectory("desktop-batch-resume-task-");
		const project = batchProject(projectDir);
		const task = { ...batchTask(taskDir), status: "paused" as const, sessionId: "paused-session" };
		project.tasks.push(task);
		mocks.getTaskState.mockResolvedValue({
			taskId: task.id,
			status: "paused",
			sessionId: "paused-session",
			sessionPath: join(projectDir, ".vetta", "sessions", "paused.jsonl"),
			executionMode: "full-access",
			lastModified: 1,
		});
		const createSession = vi.fn();
		const prompt = vi.fn(async () => {});
		const runtime = {
			createSession,
			getMessages: () => [assistantMessage("resume completed")],
			prompt,
			renameSessionById: vi.fn(),
		} as unknown as RuntimeHost;
		const completed = waitForBatchEvent((event) => event.type === "task.completed" && event.taskId === task.id);

		enqueueResumeTask(project, task, runtime, "Continue the paused task");
		await completed;

		expect(createSession).not.toHaveBeenCalled();
		expect(prompt).toHaveBeenCalledWith("paused-session", {
			text: "Continue the paused task",
			modelKey: "test/provider-model",
		});
	});

	async function temporaryDirectory(prefix: string): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), prefix));
		directories.push(directory);
		return directory;
	}
});

function waitForBatchEvent(predicate: (event: BatchTaskEvent) => boolean): Promise<BatchTaskEvent> {
	return new Promise((resolve) => {
		const unsubscribe = subscribeBatchTaskEvents((event) => {
			if (!predicate(event)) return;
			unsubscribe();
			resolve(event);
		});
	});
}

function batchProject(projectDir: string): BatchProject {
	return {
		id: projectDir,
		name: "Batch Project",
		prompt: "Run the batch task",
		modelKey: "test/provider-model",
		concurrency: 1,
		executionMode: "full-access",
		skill: { type: "scene", name: "batch-scene" },
		tasks: [],
		createdAt: 1,
		updatedAt: 1,
	};
}

function batchTask(taskDir: string): BatchTask {
	return {
		id: `task-${taskDir}`,
		name: "Batch Task",
		cwd: taskDir,
		sourcePath: join(taskDir, "source"),
		status: "pending",
		createdAt: 1,
		updatedAt: 1,
	};
}

function assistantMessage(text: string): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "openai-responses",
		provider: "test",
		model: "batch-test-model",
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
