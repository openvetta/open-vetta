import { describe, expect, it, vi } from "vitest";
import { addManualTask, EMPTY_STATE, hasRunningTask, type PluginState } from "../src/state";
import {
	detachBoardRuns,
	filterBoardRunSkills,
	followRunningTask,
	IMPLEMENT_SKILL,
	promptForRun,
	runQueuedTask,
	type BoardSessionPort,
} from "../src/run-task";

const SESSION_PATH = "/tmp/sess-1.jsonl";
const RUNTIME_ID = "sess-1";

function queuedState(...prompts: string[]): PluginState {
	return prompts.reduce(
		(state, promptText, index) =>
			addManualTask(state, { id: `task-${index + 1}`, promptText, now: index + 1, cwd: null }),
		EMPTY_STATE,
	);
}

function runningState(): PluginState {
	const queued = queuedState("Fix login");
	const task = queued.tasks[0];
	if (!task) throw new Error("expected queued task");
	return {
		...queued,
		tasks: [{ ...task, status: "running", sessionId: SESSION_PATH }],
	};
}

function fakeSessions(options?: {
	createError?: Error;
	promptError?: Error;
	promptStatus?: "sent" | "queued" | "failed";
	promptMessage?: string;
	hangPrompt?: boolean;
	hangRunning?: boolean;
}): {
	sessions: BoardSessionPort;
	create: BoardSessionPort["create"];
	prompt: BoardSessionPort["prompt"];
	abort: BoardSessionPort["abort"];
	emitRunning: (running: boolean) => void;
} {
	const listeners = new Set<(event: { sessionPath: string; running: boolean; sessionId?: string }) => void>();
	const emitRunning = (running: boolean): void => {
		for (const listener of listeners) {
			listener({ sessionPath: SESSION_PATH, running, sessionId: RUNTIME_ID });
		}
	};
	const create: BoardSessionPort["create"] = vi.fn(async () => {
		if (options?.createError) throw options.createError;
		return { sessionId: RUNTIME_ID, sessionPath: SESSION_PATH };
	});
	const prompt: BoardSessionPort["prompt"] = vi.fn(async () => {
		if (options?.promptError) throw options.promptError;
		if (options?.hangPrompt) return new Promise<never>(() => undefined);
		const status = options?.promptStatus ?? "sent";
		if (status === "failed") {
			return { status, error: { message: options?.promptMessage ?? "prompt rejected" } };
		}
		if (!options?.hangRunning) queueMicrotask(() => emitRunning(false));
		return { status };
	});
	const abort: BoardSessionPort["abort"] = vi.fn(async () => undefined);
	const sessions: BoardSessionPort = {
		create,
		prompt,
		abort,
		onRunningChanged: (handler) => {
			listeners.add(handler);
			return () => {
				listeners.delete(handler);
			};
		},
	};
	return { sessions, create, prompt, abort, emitRunning };
}

describe("runQueuedTask", () => {
	it("marks the task completed when the background session stops running", async () => {
		const { sessions, create, prompt } = fakeSessions();
		const result = await runQueuedTask({
			state: queuedState("Fix the login button"),
			taskId: "task-1",
			sessions,
			cwd: "/repo",
			now: () => 42,
		});

		expect(create).toHaveBeenCalledWith({ cwd: "/repo", title: "Fix the login button" });
		expect(prompt).toHaveBeenCalledWith(RUNTIME_ID, "Fix the login button");
		expect(result.notice).toBeNull();
		expect(result.state.tasks[0]).toMatchObject({
			status: "completed",
			sessionId: SESSION_PATH,
			updatedAt: 42,
		});
	});

	it("prefixes the implement skill token without changing the stored prompt", async () => {
		const { sessions, prompt } = fakeSessions();
		const result = await runQueuedTask({
			state: queuedState("Fix the login button"),
			taskId: "task-1",
			sessions,
			cwd: "/repo",
			now: () => 42,
			skill: IMPLEMENT_SKILL,
		});
		expect(prompt).toHaveBeenCalledWith(RUNTIME_ID, "@skill:implement Fix the login button");
		expect(result.state.tasks[0]?.promptText).toBe("Fix the login button");
	});

	it("sends override prompt text without changing the stored prompt", async () => {
		const { sessions, prompt } = fakeSessions();
		const result = await runQueuedTask({
			state: queuedState("Fix the login button"),
			taskId: "task-1",
			sessions,
			cwd: "/repo",
			now: () => 42,
			skill: "review",
			sendPromptText: "Issue body\n\nComments:\nbob: Looks good.",
		});
		expect(prompt).toHaveBeenCalledWith(
			RUNTIME_ID,
			"@skill:review Issue body\n\nComments:\nbob: Looks good.",
		);
		expect(result.state.tasks[0]?.promptText).toBe("Fix the login button");
	});

	it("leaves the prompt unchanged without a skill and does not double-prefix", () => {
		expect(promptForRun("Fix the login button")).toBe("Fix the login button");
		expect(promptForRun("Fix the login button", "implement")).toBe("@skill:implement Fix the login button");
		expect(promptForRun("@skill:implement Fix the login button", "implement")).toBe(
			"@skill:implement Fix the login button",
		);
	});

	it("marks the task failed when prompt returns failed without waiting for running events", async () => {
		const { sessions, abort } = fakeSessions({ promptStatus: "failed", promptMessage: "prompt rejected" });
		const result = await runQueuedTask({
			state: queuedState("Fix the login button"),
			taskId: "task-1",
			sessions,
			cwd: "/repo",
			now: () => 7,
		});

		expect(abort).not.toHaveBeenCalled();
		expect(result.notice).toBeNull();
		expect(result.state.tasks[0]).toMatchObject({
			status: "failed",
			sessionId: SESSION_PATH,
			error: "prompt rejected",
			updatedAt: 7,
		});
	});

	it("marks the task failed when create or prompt throws", async () => {
		const createFail = fakeSessions({ createError: new Error("cannot open session") });
		const created = await runQueuedTask({
			state: queuedState("Fix the login button"),
			taskId: "task-1",
			sessions: createFail.sessions,
			cwd: "/repo",
			now: () => 3,
		});
		expect(createFail.prompt).not.toHaveBeenCalled();
		expect(created.state.tasks[0]).toMatchObject({
			status: "failed",
			error: "cannot open session",
		});

		const promptFail = fakeSessions({ promptError: new Error("prompt rejected") });
		const sent = await runQueuedTask({
			state: queuedState("Fix the login button"),
			taskId: "task-1",
			sessions: promptFail.sessions,
			cwd: "/repo",
			now: () => 4,
		});
		expect(promptFail.create).toHaveBeenCalled();
		expect(sent.state.tasks[0]).toMatchObject({
			status: "failed",
			sessionId: SESSION_PATH,
			error: "prompt rejected",
		});
	});

	it("refuses to start a session and asks to open a project when cwd is missing", async () => {
		const { sessions, create, prompt } = fakeSessions();
		const result = await runQueuedTask({
			state: queuedState("Fix the login button"),
			taskId: "task-1",
			sessions,
			cwd: null,
			now: () => 1,
		});

		expect(create).not.toHaveBeenCalled();
		expect(prompt).not.toHaveBeenCalled();
		expect(result.notice).toBe("no-project");
		expect(result.state.tasks[0]?.status).toBe("pending");
	});

	it("marks a hanging run failed on abort so another pending task can start", async () => {
		const hanging = fakeSessions({ hangRunning: true });
		const controller = new AbortController();
		let sawRunning: () => void = () => undefined;
		const running = new Promise<void>((resolve) => {
			sawRunning = resolve;
		});
		const first = runQueuedTask({
			state: queuedState("Fix login", "Add docs"),
			taskId: "task-1",
			sessions: hanging.sessions,
			cwd: "/repo",
			now: () => 10,
			signal: controller.signal,
			stoppedError: "Stopped",
			persist: (state) => {
				if (state.tasks[0]?.status === "running" && state.tasks[0].sessionId) sawRunning();
			},
		});
		await running;
		controller.abort();
		const aborted = await first;
		expect(hanging.abort).toHaveBeenCalledWith(RUNTIME_ID);
		expect(aborted.state.tasks[0]).toMatchObject({
			status: "failed",
			error: "Stopped",
			sessionId: SESSION_PATH,
		});
		expect(hasRunningTask(aborted.state)).toBe(false);

		const finishing = fakeSessions();
		const second = await runQueuedTask({
			state: aborted.state,
			taskId: "task-2",
			sessions: finishing.sessions,
			cwd: "/repo",
			now: () => 11,
		});
		expect(second.state.tasks[1]).toMatchObject({ status: "completed" });
		expect(finishing.prompt).toHaveBeenCalledWith(RUNTIME_ID, "Add docs");
	});
});

describe("followRunningTask", () => {
	it("marks a live background run completed when it stops running", async () => {
		const { sessions, emitRunning } = fakeSessions({ hangRunning: true });
		const pending = followRunningTask({
			state: runningState(),
			taskId: "task-1",
			sessions,
			now: () => 20,
		});
		emitRunning(false);
		const result = await pending;
		expect(result.state.tasks[0]).toMatchObject({
			status: "completed",
			sessionId: SESSION_PATH,
			updatedAt: 20,
		});
	});

	it("marks a live background run failed when the user aborts", async () => {
		const { sessions, abort } = fakeSessions({ hangRunning: true });
		const controller = new AbortController();
		const pending = followRunningTask({
			state: runningState(),
			taskId: "task-1",
			sessions,
			now: () => 21,
			runtimeSessionId: RUNTIME_ID,
			signal: controller.signal,
			stoppedError: "Stopped",
		});
		controller.abort();
		const result = await pending;
		expect(abort).toHaveBeenCalledWith(RUNTIME_ID);
		expect(result.state.tasks[0]).toMatchObject({
			status: "failed",
			error: "Stopped",
			sessionId: SESSION_PATH,
		});
	});

	it("does not persist completed from a detached run after a later follower stops", async () => {
		const hanging = fakeSessions({ hangRunning: true });
		const persisted: string[] = [];
		let sawRunning: () => void = () => undefined;
		const running = new Promise<void>((resolve) => {
			sawRunning = resolve;
		});
		const first = runQueuedTask({
			state: queuedState("Fix login"),
			taskId: "task-1",
			sessions: hanging.sessions,
			cwd: "/repo",
			now: () => 10,
			persist: (state) => {
				const status = state.tasks[0]?.status;
				if (status) persisted.push(status);
				if (status === "running" && state.tasks[0]?.sessionId) sawRunning();
			},
		});
		await running;
		await Promise.resolve();
		detachBoardRuns();
		const controller = new AbortController();
		const follow = followRunningTask({
			state: runningState(),
			taskId: "task-1",
			sessions: hanging.sessions,
			now: () => 21,
			runtimeSessionId: RUNTIME_ID,
			signal: controller.signal,
			stoppedError: "Stopped",
			persist: (state) => {
				const status = state.tasks[0]?.status;
				if (status) persisted.push(`follow:${status}`);
			},
		});
		controller.abort();
		hanging.emitRunning(false);
		const followed = await follow;
		await first;
		expect(followed.state.tasks[0]).toMatchObject({ status: "failed", error: "Stopped" });
		expect(persisted.filter((status) => status === "completed" || status === "follow:completed")).toEqual([]);
		expect(persisted).toContain("follow:failed");
	});
});

describe("filterBoardRunSkills", () => {
	const skills = [
		{ name: "review", description: "Look at the diff", source: "custom", type: "skill" as const },
		{
			name: "implement",
			alias: "impl",
			description: "Write the code",
			source: "custom",
			type: "skill" as const,
		},
		{ name: "docs", description: "Update readme", source: "custom", type: "skill" as const },
	];

	it("returns every skill when the query is empty or whitespace", () => {
		expect(filterBoardRunSkills(skills, "").map((skill) => skill.name)).toEqual([
			"review",
			"implement",
			"docs",
		]);
		expect(filterBoardRunSkills(skills, "   ").map((skill) => skill.name)).toEqual([
			"review",
			"implement",
			"docs",
		]);
	});

	it("matches name, alias, and description without regard to case", () => {
		expect(filterBoardRunSkills(skills, "IMPL").map((skill) => skill.name)).toEqual(["implement"]);
		expect(filterBoardRunSkills(skills, "readme").map((skill) => skill.name)).toEqual(["docs"]);
		expect(filterBoardRunSkills(skills, "Review").map((skill) => skill.name)).toEqual(["review"]);
	});

	it("returns an empty list when nothing matches", () => {
		expect(filterBoardRunSkills(skills, "zzzz")).toEqual([]);
	});
});
