import {
	createCodingAgentBackgroundCommandHost,
	createCodingAgentForegroundCommandHost,
} from "@vetta/coding-agent/host";
import { afterEach, describe, expect, it } from "vitest";
import {
	BackgroundTaskManager,
	type BackgroundTaskSnapshot,
	buildTaskNotification,
} from "../../../../coding-agent/src/core/background-tasks/index.js";
import { createBashTool as createLegacyBashTool } from "../../../../coding-agent/src/core/tools/bash/index.js";
import { createShellTool as createLegacyShellTool } from "../../../../coding-agent/src/core/tools/shell/index.js";
import { createTaskOutputTool as createLegacyTaskOutputTool } from "../../../../coding-agent/src/core/tools/task-output/index.js";
import { createTaskStopTool as createLegacyTaskStopTool } from "../../../../coding-agent/src/core/tools/task-stop/index.js";
import {
	type BackgroundCommandService,
	type BackgroundCommandSnapshot,
	buildBackgroundCommandNotification,
	createBackgroundCommandService,
	createBackgroundCommandToolExecutor,
	createBashToolRegistration,
	createForegroundCommandToolExecutor,
	createShellToolRegistration,
	createTaskOutputToolRegistration,
	createTaskStopToolRegistration,
} from "../../../src/coding/index.js";

type CommandName = "bash" | "shell";

const managers: BackgroundTaskManager[] = [];
const services: BackgroundCommandService[] = [];

afterEach(async () => {
	for (const manager of managers) manager.killAll();
	for (const service of services) service.dispose();
	await new Promise((resolve) => setTimeout(resolve, 50));
	managers.length = 0;
	services.length = 0;
});

function createManager(): BackgroundTaskManager {
	const manager = new BackgroundTaskManager();
	managers.push(manager);
	return manager;
}

function createLegacyCommandTool(name: CommandName, manager: BackgroundTaskManager, blockUntilSec: number) {
	const options = { backgroundTasks: manager, blockUntilSec };
	return name === "bash"
		? createLegacyBashTool(process.cwd(), options)
		: createLegacyShellTool(process.cwd(), options);
}

function createRuntimeCommandTool(
	name: CommandName,
	blockUntilSec: number,
	onNotification?: (task: Parameters<typeof buildBackgroundCommandNotification>[0]) => void,
) {
	const host = createCodingAgentForegroundCommandHost(process.cwd());
	const backgroundService = createRuntimeBackgroundService();
	if (onNotification) backgroundService.subscribeNotifications(onNotification);
	const foregroundExecutor = createForegroundCommandToolExecutor({ ...host, blockUntilSec });
	const executor = createBackgroundCommandToolExecutor({
		...host,
		backgroundService,
		foregroundExecutor,
		blockUntilSec,
	});
	return {
		backgroundService,
		tool:
			name === "bash"
				? createBashToolRegistration(process.cwd(), { executor }).tool
				: createShellToolRegistration(process.cwd(), { executor }).tool,
	};
}

function createRuntimeBackgroundService(): BackgroundCommandService {
	const service = createBackgroundCommandService(createCodingAgentBackgroundCommandHost());
	services.push(service);
	return service;
}

function runtimeRequest(input: { command: string; timeout?: number; run_in_background?: boolean }) {
	return {
		sessionId: "session-1",
		turnId: "turn-1",
		toolCallId: "tool-call-1",
		input,
		signal: new AbortController().signal,
	};
}

function normalizeTaskArtifacts(value: unknown): unknown {
	return JSON.parse(
		JSON.stringify(value, (key, nestedValue) =>
			key === "startedAt" || key === "endedAt" ? "<timestamp>" : nestedValue,
		).replace(/vetta-task-b\d+-[0-9a-f]+\.log/g, "vetta-task-<id>.log"),
	);
}

function localNodeCommand(script: string): string {
	const executable = `"${process.execPath}"`;
	return `${process.platform === "win32" ? "& " : ""}${executable} -e "${script}"`;
}

async function waitForCompletion(
	owner: {
		wait(taskId: string, options: { maxMs: number }): Promise<{ stillRunning: boolean }>;
	},
	taskId: string,
): Promise<void> {
	const result = await owner.wait(taskId, { maxMs: 10_000 });
	expect(result.stillRunning).toBe(false);
	await new Promise((resolve) => setTimeout(resolve, 20));
}

describe.each(["bash", "shell"] as const)("runtime %s background command", (toolName) => {
	it("preserves explicit background execution and completion notification", async () => {
		const legacyManager = createManager();
		const legacyNotifications: BackgroundTaskSnapshot[] = [];
		const runtimeNotifications: BackgroundCommandSnapshot[] = [];
		legacyManager.onNotify = (task) => legacyNotifications.push(task);
		const legacy = createLegacyCommandTool(toolName, legacyManager, 5);
		const runtime = createRuntimeCommandTool(toolName, 5, (task) => runtimeNotifications.push(task));
		const input = {
			command: localNodeCommand("process.stdout.write('background-ok')"),
			run_in_background: true,
		};

		const legacyResult = await legacy.execute("tool-call-1", input);
		const runtimeResult = await runtime.tool.execute(runtimeRequest(input));
		expect(normalizeTaskArtifacts(runtimeResult)).toEqual(normalizeTaskArtifacts(legacyResult));

		await Promise.all([waitForCompletion(legacyManager, "b1"), waitForCompletion(runtime.backgroundService, "b1")]);
		expect(normalizeTaskArtifacts(runtimeNotifications)).toEqual(normalizeTaskArtifacts(legacyNotifications));
		expect(normalizeTaskArtifacts(buildBackgroundCommandNotification(runtimeNotifications[0]))).toEqual(
			normalizeTaskArtifacts(buildTaskNotification(legacyNotifications[0])),
		);
	});

	it("preserves inline completion and soft-wait auto-promotion", async () => {
		const quickCommand = localNodeCommand("process.stdout.write('inline-ok')");
		const legacyQuickManager = createManager();
		const legacyQuickNotifications: BackgroundTaskSnapshot[] = [];
		const runtimeQuickNotifications: BackgroundCommandSnapshot[] = [];
		legacyQuickManager.onNotify = (task) => legacyQuickNotifications.push(task);
		const legacyQuick = createLegacyCommandTool(toolName, legacyQuickManager, 5);
		const runtimeQuick = createRuntimeCommandTool(toolName, 5, (task) => runtimeQuickNotifications.push(task));
		const legacyQuickResult = await legacyQuick.execute("tool-call-1", { command: quickCommand });
		const runtimeQuickResult = await runtimeQuick.tool.execute(runtimeRequest({ command: quickCommand }));
		expect(normalizeTaskArtifacts(runtimeQuickResult)).toEqual(normalizeTaskArtifacts(legacyQuickResult));
		expect(runtimeQuickNotifications).toEqual(legacyQuickNotifications);

		const longCommand = localNodeCommand("setTimeout(() => {}, 300)");
		const legacyManager = createManager();
		const legacyNotifications: BackgroundTaskSnapshot[] = [];
		const runtimeNotifications: BackgroundCommandSnapshot[] = [];
		legacyManager.onNotify = (task) => legacyNotifications.push(task);
		const legacyLong = createLegacyCommandTool(toolName, legacyManager, 0.05);
		const runtimeLong = createRuntimeCommandTool(toolName, 0.05, (task) => runtimeNotifications.push(task));
		const legacyUpdates: unknown[] = [];
		const runtimeUpdates: unknown[] = [];
		const legacyLongResult = await legacyLong.execute(
			"tool-call-1",
			{ command: longCommand },
			undefined,
			(update) => {
				legacyUpdates.push(update);
			},
		);
		const runtimeLongResult = await runtimeLong.tool.execute({
			...runtimeRequest({ command: longCommand }),
			onUpdate: (update) => runtimeUpdates.push(update),
		});

		expect(normalizeTaskArtifacts(runtimeLongResult)).toEqual(normalizeTaskArtifacts(legacyLongResult));
		expect(normalizeTaskArtifacts(runtimeUpdates)).toEqual(normalizeTaskArtifacts(legacyUpdates));
		expect(runtimeLong.backgroundService.get("b1")?.status).toBe("running");
		await Promise.all([
			waitForCompletion(legacyManager, "b1"),
			waitForCompletion(runtimeLong.backgroundService, "b1"),
		]);
		expect(normalizeTaskArtifacts(runtimeNotifications)).toEqual(normalizeTaskArtifacts(legacyNotifications));
	});

	it("preserves inline background-service failures and line truncation", async () => {
		const failingCommand = localNodeCommand("process.stderr.write('background-failure');process.exit(2)");
		const legacyFailure = createLegacyCommandTool(toolName, createManager(), 5);
		const runtimeFailure = createRuntimeCommandTool(toolName, 5);
		const legacyFailurePromise = legacyFailure.execute("tool-call-1", { command: failingCommand });
		const runtimeFailurePromise = runtimeFailure.tool.execute(runtimeRequest({ command: failingCommand }));
		const [legacyFailureResult, runtimeFailureResult] = await Promise.allSettled([
			legacyFailurePromise,
			runtimeFailurePromise,
		]);
		expect(legacyFailureResult.status).toBe("rejected");
		expect(runtimeFailureResult.status).toBe("rejected");
		if (legacyFailureResult.status !== "rejected" || runtimeFailureResult.status !== "rejected") {
			throw new Error("Expected both command executions to fail");
		}
		expect(runtimeFailureResult.reason).toEqual(legacyFailureResult.reason);

		const truncatingCommand = localNodeCommand(
			"process.stdout.write(Array.from({length:2002},(_,i)=>'line-'+i).join('\\n'))",
		);
		const legacyTruncation = createLegacyCommandTool(toolName, createManager(), 5);
		const runtimeTruncation = createRuntimeCommandTool(toolName, 5);
		const legacyResult = await legacyTruncation.execute("tool-call-1", { command: truncatingCommand });
		const runtimeResult = await runtimeTruncation.tool.execute(runtimeRequest({ command: truncatingCommand }));
		expect(normalizeTaskArtifacts(runtimeResult)).toEqual(normalizeTaskArtifacts(legacyResult));
	});
});

describe("runtime background task tools", () => {
	it("preserves completed, failed, and killed notification formatting", () => {
		const cases: BackgroundTaskSnapshot[] = [
			{
				id: "b1",
				command: "echo done",
				cwd: "C:/workspace",
				status: "completed",
				outputFile: "C:/tmp/task.log",
				exitCode: 0,
				startedAt: 1,
				endedAt: 2,
				toolCallId: "tool-call-1",
				tail: "done",
			},
			{
				id: "b2",
				command: "exit 2",
				cwd: "C:/workspace",
				status: "failed",
				outputFile: "C:/tmp/task.log",
				exitCode: 2,
				startedAt: 1,
				endedAt: 2,
				tail: "failed",
			},
			{
				id: "b3",
				command: "serve",
				cwd: "C:/workspace",
				status: "killed",
				outputFile: "C:/tmp/task.log",
				exitCode: undefined,
				startedAt: 1,
				endedAt: 2,
				tail: "",
				endedBy: "user",
			},
			{
				id: "b4",
				command: "watch",
				cwd: "C:/workspace",
				status: "killed",
				outputFile: "C:/tmp/task.log",
				exitCode: undefined,
				startedAt: 1,
				endedAt: 2,
				tail: "",
				endedBy: "agent",
			},
		];

		for (const task of cases) {
			expect(buildBackgroundCommandNotification(task)).toBe(buildTaskNotification(task));
		}
	});

	it("preserves definitions, registration metadata, completed output, and incremental cursor behavior", async () => {
		const legacyManager = createManager();
		const service = createRuntimeBackgroundService();
		const legacy = createLegacyTaskOutputTool({ getManager: () => legacyManager });
		const runtime = createTaskOutputToolRegistration({ backgroundService: service });

		expect({
			name: runtime.tool.name,
			label: runtime.tool.label,
			description: runtime.tool.description,
			schema: runtime.tool.inputSchema,
			scopeUse: runtime.scopeUse,
			requires: runtime.requires,
			category: runtime.category,
		}).toEqual({
			name: legacy.name,
			label: legacy.label,
			description: legacy.description,
			schema: legacy.parameters,
			scopeUse: legacy.scope_use,
			requires: legacy.requires,
			category: legacy.category,
		});

		const command = localNodeCommand("process.stdout.write('task-output-ok')");
		legacyManager.spawn({ command, cwd: process.cwd(), env: { ...process.env } });
		service.spawn({ command, cwd: process.cwd(), env: { ...process.env } });
		await Promise.all([waitForCompletion(legacyManager, "b1"), waitForCompletion(service, "b1")]);

		const legacyFirst = await legacy.execute("legacy-output", { task_id: "b1", from_start: true });
		const runtimeFirst = await runtime.tool.execute({
			sessionId: "session-1",
			turnId: "turn-1",
			toolCallId: "runtime-output",
			input: { task_id: "b1", from_start: true },
			signal: new AbortController().signal,
		});
		expect(normalizeTaskArtifacts(runtimeFirst)).toEqual(normalizeTaskArtifacts(legacyFirst));

		const legacySecond = await legacy.execute("legacy-output-2", { task_id: "b1" });
		const runtimeSecond = await runtime.tool.execute({
			sessionId: "session-1",
			turnId: "turn-1",
			toolCallId: "runtime-output-2",
			input: { task_id: "b1" },
			signal: new AbortController().signal,
		});
		expect(normalizeTaskArtifacts(runtimeSecond)).toEqual(normalizeTaskArtifacts(legacySecond));
	});

	it("preserves task_stop running, completed, and missing-task behavior", async () => {
		const legacyManager = createManager();
		const service = createRuntimeBackgroundService();
		const legacy = createLegacyTaskStopTool({ getManager: () => legacyManager });
		const runtime = createTaskStopToolRegistration({ backgroundService: service });
		const command = localNodeCommand("setTimeout(() => {}, 30000)");
		legacyManager.spawn({ command, cwd: process.cwd(), env: { ...process.env } });
		service.spawn({ command, cwd: process.cwd(), env: { ...process.env } });

		const legacyRunning = await legacy.execute("legacy-stop", { task_id: "b1" });
		const runtimeRunning = await runtime.tool.execute({
			sessionId: "session-1",
			turnId: "turn-1",
			toolCallId: "runtime-stop",
			input: { task_id: "b1" },
			signal: new AbortController().signal,
		});
		expect(runtimeRunning).toEqual(legacyRunning);
		await Promise.all([waitForCompletion(legacyManager, "b1"), waitForCompletion(service, "b1")]);

		const legacyCompleted = await legacy.execute("legacy-stop-completed", { task_id: "b1" });
		const runtimeCompleted = await runtime.tool.execute({
			sessionId: "session-1",
			turnId: "turn-1",
			toolCallId: "runtime-stop-completed",
			input: { task_id: "b1" },
			signal: new AbortController().signal,
		});
		expect(runtimeCompleted).toEqual(legacyCompleted);
		expect(normalizeTaskArtifacts(service.get("b1"))).toEqual(normalizeTaskArtifacts(legacyManager.get("b1")));

		await expect(legacy.execute("legacy-stop-missing", { task_id: "missing" })).rejects.toThrow(
			'Background task "missing" not found.',
		);
		await expect(
			runtime.tool.execute({
				sessionId: "session-1",
				turnId: "turn-1",
				toolCallId: "runtime-stop-missing",
				input: { task_id: "missing" },
				signal: new AbortController().signal,
			}),
		).rejects.toThrow('Background task "missing" not found.');
	});
});
