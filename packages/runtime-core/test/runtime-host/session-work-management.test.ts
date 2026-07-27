import { describe, expect, it, vi } from "vitest";
import {
	type BackgroundTaskInfo,
	LegacyRuntimeSessionBackgroundWorkController,
	LegacyRuntimeSessionTodoController,
	type RuntimeSession,
	type RuntimeSubagentSnapshot,
	type TodoItem,
} from "../../src/index.js";

const backgroundTask: BackgroundTaskInfo = {
	id: "task-1",
	command: "echo work",
	cwd: "C:/workspace",
	status: "running",
	outputFile: "C:/workspace/task.log",
	exitCode: undefined,
	startedAt: 1,
	tail: "work",
};

const subagent: RuntimeSubagentSnapshot = {
	id: "agent-1",
	taskName: "worker",
	path: "/worker",
	agentType: "coding",
	status: "running",
	task: "work",
	parentSessionId: "session-1",
	startedAt: 2,
	generation: 0,
	usage: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, costTotal: 0.5 },
};

describe("legacy session work management ports", () => {
	it("preserves background task and subagent reads and commands", () => {
		const taskList = [backgroundTask];
		const subagentList = [subagent];
		const clearBackground = vi.fn(() => 2);
		const clearSubagents = vi.fn(() => 3);
		const kill = vi.fn(() => true);
		const interrupt = vi.fn(() => subagent);
		const session = {
			backgroundTasks: {
				clearFinished: clearBackground,
				kill,
				list: () => taskList,
			},
			clearFinishedSubagents: clearSubagents,
			listSubagents: () => subagentList,
			interruptSubagent: interrupt,
		} as unknown as RuntimeSession;
		const controller = new LegacyRuntimeSessionBackgroundWorkController(session);

		const tasks = controller.readTasks();
		const subagents = controller.readSubagents();
		expect(tasks).toEqual(taskList);
		expect(tasks).not.toBe(taskList);
		expect(subagents).toEqual(subagentList);
		expect(subagents).not.toBe(subagentList);
		expect(controller.killTask("task-1")).toBe(true);
		expect(kill).toHaveBeenCalledWith("task-1", "user");
		expect(controller.interruptSubagent("worker")).toEqual(subagent);
		expect(interrupt).toHaveBeenCalledWith("worker");
		expect(controller.clearFinished()).toBe(5);
		expect(clearBackground).toHaveBeenCalledBefore(clearSubagents);
	});

	it("preserves full subagent usage in the runtime-owned snapshot", () => {
		const session = {
			backgroundTasks: { list: () => [], clearFinished: () => 0, kill: () => false },
			clearFinishedSubagents: () => 0,
			listSubagents: () => [subagent],
			interruptSubagent: () => undefined,
		} as unknown as RuntimeSession;
		const controller = new LegacyRuntimeSessionBackgroundWorkController(session);

		expect(controller.readSubagents()[0]?.usage).toEqual(subagent.usage);
	});

	it("returns a copied todo projection", () => {
		const items: TodoItem[] = [{ id: 1, content: "work", status: "pending" }];
		const session = {
			todoStore: { getAll: () => items },
		} as unknown as RuntimeSession;
		const controller = new LegacyRuntimeSessionTodoController(session);

		const result = controller.readItems();
		expect(result).toEqual(items);
		expect(result).not.toBe(items);
	});

	it.each([
		{ name: "locked", locked: true, items: [{ id: 1, content: "work", status: "pending" }] },
		{ name: "empty", locked: false, items: [] },
	])("does not clear a $name todo store", ({ locked, items }) => {
		const clear = vi.fn();
		const session = {
			todoStore: { isLocked: () => locked, getAll: () => items, clear },
		} as unknown as RuntimeSession;
		const controller = new LegacyRuntimeSessionTodoController(session);

		expect(controller.clear()).toBe(false);
		expect(clear).not.toHaveBeenCalled();
	});

	it("clears a non-empty unlocked todo store", () => {
		const clear = vi.fn();
		const session = {
			todoStore: {
				isLocked: () => false,
				getAll: () => [{ id: 1, content: "work", status: "pending" }],
				clear,
			},
		} as unknown as RuntimeSession;
		const controller = new LegacyRuntimeSessionTodoController(session);

		expect(controller.clear()).toBe(true);
		expect(clear).toHaveBeenCalledOnce();
	});
});
