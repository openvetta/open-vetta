import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AssistantMessage, Message, StopReason } from "@mariozechner/pi-ai";
import type { RuntimeHost, SessionExecutionMode } from "../../../../runtime-core/src/index.js";
import { resolveExecutionMode } from "../execution-mode.js";
import { readDesktopConfig } from "../ipc/fs.js";
import { assertSandboxAvailableForMode } from "../sandbox/capability.js";
import { getWebhookManager } from "../webhook/index.js";
import { verifyArtifacts } from "./artifact-validator";
import { type BatchTaskState, saveTaskState } from "./batch-task-state";
import type { BatchProject, BatchTask } from "./batch-task-storage";
import { getProject } from "./batch-task-storage";
import {
	buildProjectSummaryMessage,
	buildTaskFinishedMessage,
	isProjectFinished,
	type TaskOutcome,
} from "./notification-templates.js";

const TASK_TMP_SUBDIR = ".tmp";

const TASK_TIMEOUT_MS = 60 * 60 * 1000;

export type BatchTaskEvent =
	| {
			type: "task.started";
			projectId: string;
			taskId: string;
			sessionId: string;
			sessionPath: string | undefined;
			executionMode: SessionExecutionMode;
	  }
	| { type: "task.completed"; projectId: string; taskId: string }
	| { type: "task.failed"; projectId: string; taskId: string; error: string }
	| { type: "task.paused"; projectId: string; taskId: string }
	| { type: "task.resumed"; projectId: string; taskId: string }
	| { type: "task.reset"; projectId: string; taskId: string }
	| { type: "task.queued"; projectId: string; taskId: string }
	| { type: "task.dequeued"; projectId: string; taskId: string }
	| { type: "project.paused"; projectId: string; pausedAt: number }
	| { type: "project.resumed"; projectId: string };

interface ExecutingTask {
	projectId: string;
	taskId: string;
	cwd: string;
	artifactPatterns: string[] | undefined;
	sessionId: string;
	sessionPath: string | undefined;
	executionMode: SessionExecutionMode;
	abortController: AbortController;
	timeoutHandle: ReturnType<typeof setTimeout>;
	timedOut: boolean;
	startedAt: number;
	modelKey: string | undefined;
}

const executingTasks = new Map<string, ExecutingTask>();
const eventHandlers = new Set<(event: BatchTaskEvent) => void>();

// ─── Per-project concurrency scheduler ─────────────────────────────────────
//
// 单点"运行"和批量启动共用一个调度器，保证同一项目内同时执行的任务数永远不
// 超过 project.concurrency。runningByProject 跟踪已经启动并占用 worker 槽位的
// taskId；pendingByProject 是 FIFO 等待队列。所有 run/resume 入口都经过
// enqueueJob，由调度器决定立即执行还是排队。
//
// 仅在主进程内存中维护——重启后队列丢失（pending 的任务回到"未执行"或上次
// 持久化的状态），与 recoverRunningTasks() 把 stale running 标 failed 的行为一致。

type PendingJob = {
	kind: "run" | "resume";
	project: BatchProject;
	task: BatchTask;
	runtime: RuntimeHost;
};

const runningByProject = new Map<string, Set<string>>();
const pendingByProject = new Map<string, PendingJob[]>();

/**
 * 项目级"已暂停"内存集合。BATCH_PAUSE 写入，BATCH_RESUME 移除；
 * enqueueJob / drainQueue 都查这个集合，paused 时直接拒绝调度，
 * 防止 worker 完成后从 pending 队列里替补出新任务。重启后由
 * batch-tasks IPC 启动逻辑根据持久化的 meta.pausedAt 重建。
 */
const pausedProjects = new Set<string>();

export function isProjectSchedulingPaused(projectId: string): boolean {
	return pausedProjects.has(projectId);
}

/**
 * 标记项目为暂停态并清空内存 pending 队列。返回被赶出的 task 列表，
 * 调用方通常会把这些 task 的持久化状态置为 "paused"，让 BATCH_RESUME
 * 能凭 status === "paused" 一次性重启它们，而不用区分"被暂停的排队
 * 任务"和"从未执行过的 pending"。已经在跑的 running 任务由调用方
 * 逐个走 pauseTask abort，这里不处理。
 */
export function pauseProjectScheduling(projectId: string): { kind: "run" | "resume"; task: BatchTask }[] {
	pausedProjects.add(projectId);
	const queue = getPendingQueue(projectId);
	if (queue.length === 0) {
		console.log(`[BatchTask] pauseProjectScheduling: project=${projectId}, no pending jobs`);
		return [];
	}
	const dequeued = queue.splice(0, queue.length);
	for (const job of dequeued) {
		emitBatchTaskEvent({ type: "task.dequeued", projectId, taskId: job.task.id });
	}
	console.log(`[BatchTask] pauseProjectScheduling: project=${projectId}, dequeued ${dequeued.length} pending jobs`);
	return dequeued.map((j) => ({ kind: j.kind, task: j.task }));
}

export function resumeProjectScheduling(projectId: string): void {
	pausedProjects.delete(projectId);
	console.log(`[BatchTask] resumeProjectScheduling: project=${projectId}`);
}

function getRunningSet(projectId: string): Set<string> {
	let s = runningByProject.get(projectId);
	if (!s) {
		s = new Set<string>();
		runningByProject.set(projectId, s);
	}
	return s;
}

function getPendingQueue(projectId: string): PendingJob[] {
	let q = pendingByProject.get(projectId);
	if (!q) {
		q = [];
		pendingByProject.set(projectId, q);
	}
	return q;
}

export function isTaskQueued(taskId: string): boolean {
	for (const queue of pendingByProject.values()) {
		if (queue.some((j) => j.task.id === taskId)) return true;
	}
	return false;
}

export function getQueuedTaskIds(): string[] {
	const ids: string[] = [];
	for (const queue of pendingByProject.values()) {
		for (const j of queue) ids.push(j.task.id);
	}
	return ids;
}

function enqueueJob(job: PendingJob): void {
	const projectId = job.project.id;
	if (pausedProjects.has(projectId)) {
		console.log(`[BatchTask] enqueueJob: project ${projectId} paused, skip task ${job.task.id}`);
		return;
	}
	const running = getRunningSet(projectId);
	const queue = getPendingQueue(projectId);

	if (running.has(job.task.id)) {
		console.warn(`[BatchTask] enqueueJob: task ${job.task.id} already running, skip`);
		return;
	}
	if (queue.some((j) => j.task.id === job.task.id)) {
		console.warn(`[BatchTask] enqueueJob: task ${job.task.id} already queued, skip`);
		return;
	}

	const concurrency = Math.max(1, job.project.concurrency);
	if (running.size < concurrency) {
		running.add(job.task.id);
		void startJob(job);
	} else {
		queue.push(job);
		console.log(
			`[BatchTask] task ${job.task.id} queued (project ${projectId}, running=${running.size}/${concurrency})`,
		);
		emitBatchTaskEvent({ type: "task.queued", projectId, taskId: job.task.id });
	}
}

async function startJob(job: PendingJob): Promise<void> {
	try {
		if (job.kind === "run") {
			await runTaskInner(job.project, job.task, job.runtime);
		} else {
			await resumeTaskInner(job.project, job.task, job.runtime);
		}
	} finally {
		const running = getRunningSet(job.project.id);
		running.delete(job.task.id);
		drainQueue(job.project.id);
	}
}

function drainQueue(projectId: string): void {
	if (pausedProjects.has(projectId)) return;
	const queue = getPendingQueue(projectId);
	const running = getRunningSet(projectId);
	while (queue.length > 0) {
		const next = queue[0];
		const concurrency = Math.max(1, next.project.concurrency);
		if (running.size >= concurrency) break;
		queue.shift();
		running.add(next.task.id);
		void startJob(next);
	}
}

export function enqueueRunTask(project: BatchProject, task: BatchTask, runtime: RuntimeHost): void {
	enqueueJob({ kind: "run", project, task, runtime });
}

export function enqueueResumeTask(project: BatchProject, task: BatchTask, runtime: RuntimeHost): void {
	enqueueJob({ kind: "resume", project, task, runtime });
}

/**
 * 从 pending 队列移除一个尚未启动的任务。返回是否命中。
 * 用于 pauseTask / deleteTask / cleanTaskFilesAndState 在任务进入执行之前
 * 直接撤销排队，无需走 abort 路径。
 */
export function removeFromPending(projectId: string, taskId: string): boolean {
	const queue = getPendingQueue(projectId);
	const idx = queue.findIndex((j) => j.task.id === taskId);
	if (idx < 0) return false;
	queue.splice(idx, 1);
	emitBatchTaskEvent({ type: "task.dequeued", projectId, taskId });
	console.log(`[BatchTask] task ${taskId} removed from pending queue`);
	return true;
}

export function emitBatchTaskEvent(event: BatchTaskEvent): void {
	for (const handler of eventHandlers) {
		handler(event);
	}
}

/**
 * Push a task-finished webhook (and, when the project is fully done, a
 * summary message). Best-effort: failures are logged and never bubble up so a
 * misbehaving webhook can't strand a finalized batch task.
 *
 * `getProject` is re-read so the message reflects post-save state (statuses
 * for sibling tasks may have changed concurrently under parallel workers).
 */
async function maybeNotifyTaskFinished(
	projectId: string,
	taskId: string,
	outcome: TaskOutcome,
	startedAt: number | undefined,
	finishedAt: number,
	modelKey: string | undefined,
): Promise<void> {
	try {
		const project = await getProject(projectId);
		if (!project?.notifyEnabled) return;
		const task = project.tasks.find((t) => t.id === taskId);
		if (!task) return;

		const manager = getWebhookManager();
		const taskMessage = buildTaskFinishedMessage({
			project,
			task,
			outcome,
			startedAt,
			finishedAt,
			modelKey,
		});
		void manager.broadcast(taskMessage).catch((err: unknown) => {
			console.warn(`[BatchTask] notify task-finished broadcast failed: ${(err as Error).message}`);
		});

		if (isProjectFinished(project.tasks)) {
			const summary = buildProjectSummaryMessage({ project, finishedAt });
			void manager.broadcast(summary).catch((err: unknown) => {
				console.warn(`[BatchTask] notify project-summary broadcast failed: ${(err as Error).message}`);
			});
		}
	} catch (err) {
		console.warn(`[BatchTask] maybeNotifyTaskFinished failed: ${(err as Error).message}`);
	}
}

export function subscribeBatchTaskEvents(handler: (event: BatchTaskEvent) => void): () => void {
	eventHandlers.add(handler);
	return () => {
		eventHandlers.delete(handler);
	};
}

function findLastAssistant(messages: Message[]): AssistantMessage | undefined {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (m.role === "assistant") return m;
	}
	return undefined;
}

function buildTaskSystemPrompt(task: BatchTask): string {
	const tmpDir = join(task.cwd, TASK_TMP_SUBDIR);
	return [
		`## 批量任务上下文`,
		`- 源目录路径（只读参考）: ${task.sourcePath}`,
		`- 工作目录: ${task.cwd}`,
		`- 临时目录（已为本任务私有，可写入中间文件）: ${tmpDir}`,
		`- 任务名称: ${task.name}`,
		``,
		`## 规则`,
		`- 只读取源目录路径中的文件作为参考，不要修改源目录中的任何内容`,
		`- 最终产物文件必须放在工作目录的顶层（不要放进 ${TASK_TMP_SUBDIR}/ 子目录）`,
		`- 任何临时文件、辅助脚本、中间产物必须写入上面给出的临时目录，禁止写入 /tmp、/var/tmp、C:\\Windows\\Temp 等系统共享目录`,
		`- TMPDIR、TEMP、TMP 环境变量已自动指向该临时目录，Python tempfile、bash mktemp 等会自动落到这里`,
		`- 完成所有工作后直接结束，不要等待用户确认`,
	].join("\n");
}

function scheduleTimeout(taskId: string, runtime: RuntimeHost): ReturnType<typeof setTimeout> {
	return setTimeout(() => {
		const executing = executingTasks.get(taskId);
		if (!executing) return;
		console.warn(`[BatchTask] Task ${taskId} timed out after ${TASK_TIMEOUT_MS}ms, aborting`);
		executing.timedOut = true;
		runtime.abort(executing.sessionId).catch((err) => {
			console.warn(`[BatchTask] abort on timeout failed for ${taskId}: ${err}`);
		});
	}, TASK_TIMEOUT_MS);
}

// runtime.prompt / runtime.continue 在所有 auto-retry 用尽后才 return（session 内 waitForRetry）。
// 此时最后一条 assistant message 的 stopReason 才是任务真正的终态。
// 直接监听 lifecycle agent_end 不可靠：retry 序列里每次 LLM 调用都会触发 agent_end。
async function finalizeTask(projectId: string, taskId: string, runtime: RuntimeHost): Promise<void> {
	const executing = executingTasks.get(taskId);
	if (!executing) {
		// pauseTask 已经写过终态并清理
		return;
	}
	clearTimeout(executing.timeoutHandle);

	let last: AssistantMessage | undefined;
	try {
		last = findLastAssistant(runtime.getMessages(executing.sessionId));
	} catch (err) {
		console.warn(`[BatchTask] finalizeTask: failed to read messages for ${taskId}: ${err}`);
	}

	const stopReason: StopReason | undefined = last?.stopReason;
	const errMessage = last?.errorMessage;
	const now = Date.now();
	const base = {
		taskId,
		sessionId: executing.sessionId,
		sessionPath: executing.sessionPath,
		executionMode: executing.executionMode,
		lastModified: now,
	};

	let state: BatchTaskState;
	let outcome: TaskOutcome | null = null;

	if (executing.timedOut) {
		const message = `任务超时（${Math.round(TASK_TIMEOUT_MS / 60000)} 分钟未完成）`;
		state = { ...base, status: "failed", error: message, completedAt: now };
		emitBatchTaskEvent({ type: "task.failed", projectId, taskId, error: message });
		outcome = { kind: "timeout" };
	} else if (stopReason === "stop") {
		const verify = await verifyArtifacts(executing.cwd, executing.artifactPatterns);
		if (verify.ok) {
			state = { ...base, status: "completed", completedAt: now };
			emitBatchTaskEvent({ type: "task.completed", projectId, taskId });
			outcome = { kind: "completed" };
		} else {
			const message = `产物缺失: ${verify.missingPatterns.join(", ")}`;
			state = { ...base, status: "failed", error: message, completedAt: now };
			emitBatchTaskEvent({ type: "task.failed", projectId, taskId, error: message });
			outcome = { kind: "artifact-missing", missing: verify.missingPatterns };
		}
	} else if (stopReason === "aborted") {
		state = { ...base, status: "paused" };
		emitBatchTaskEvent({ type: "task.paused", projectId, taskId });
		// 主动暂停不推送
	} else {
		const message = errMessage ?? `Agent ended unexpectedly (stopReason=${stopReason ?? "unknown"})`;
		state = { ...base, status: "failed", error: message, completedAt: now };
		emitBatchTaskEvent({ type: "task.failed", projectId, taskId, error: message });
		outcome = { kind: "failed", error: message };
	}

	await saveTaskState(projectId, taskId, state);
	const capturedStartedAt = executing.startedAt;
	const capturedModelKey = executing.modelKey;
	executingTasks.delete(taskId);

	if (outcome) {
		await maybeNotifyTaskFinished(projectId, taskId, outcome, capturedStartedAt, now, capturedModelKey);
	}
}

async function runTaskInner(project: BatchProject, task: BatchTask, runtime: RuntimeHost): Promise<void> {
	const abortController = new AbortController();
	console.log(
		`[BatchTask] runTask: project=${project.id}(${project.name}), task=${task.id}(${task.name}), cwd=${task.cwd}`,
	);

	let sessionId: string | undefined;
	let sessionPath: string | undefined;
	let executionMode: SessionExecutionMode | undefined;

	try {
		const config = await readDesktopConfig();
		const mode = resolveExecutionMode(project.executionMode, config.defaultExecutionMode);
		executionMode = mode;
		await assertSandboxAvailableForMode(mode, async () => mode);

		const sessionDir = join(project.id, ".vetta", "sessions");
		const taskSystemPrompt = buildTaskSystemPrompt(task);
		// 为本任务准备私有临时目录。三套环境变量同时设：
		// TMPDIR 覆盖 macOS / Linux，TEMP + TMP 覆盖 Windows，
		// 同时也覆盖 Python tempfile / bash mktemp 等系统调用的隐式路径。
		const taskTmpDir = join(task.cwd, TASK_TMP_SUBDIR);
		await mkdir(taskTmpDir, { recursive: true });
		const result = await runtime.createSession({
			cwd: task.cwd,
			sessionDir,
			appendSystemPrompt: taskSystemPrompt,
			executionMode: mode,
			env: {
				TMPDIR: taskTmpDir,
				TEMP: taskTmpDir,
				TMP: taskTmpDir,
			},
		});
		sessionId = result.sessionId;
		sessionPath = runtime.getSessionPath(sessionId);

		const startedAt = Date.now();
		const timeoutHandle = scheduleTimeout(task.id, runtime);
		executingTasks.set(task.id, {
			projectId: project.id,
			taskId: task.id,
			cwd: task.cwd,
			artifactPatterns: project.artifactPatterns,
			sessionId,
			sessionPath,
			executionMode: mode,
			abortController,
			timeoutHandle,
			timedOut: false,
			startedAt,
			modelKey: project.modelKey,
		});
		console.log(`[BatchTask] Session created: ${sessionId}, path=${sessionPath}`);

		runtime.renameSessionById(sessionId, `${project.name}: ${task.name}`);

		const runningState: BatchTaskState = {
			taskId: task.id,
			status: "running",
			sessionId,
			sessionPath,
			executionMode: mode,
			startedAt,
			lastModified: startedAt,
		};
		await saveTaskState(project.id, task.id, runningState);

		emitBatchTaskEvent({
			type: "task.started",
			projectId: project.id,
			taskId: task.id,
			sessionId,
			sessionPath,
			executionMode: mode,
		});
		console.log(`[BatchTask] task.started emitted: ${task.id}`);

		// 模型选择透传给 prompt — 跟 chat 走完全一致的路径（useSessionManager 也是
		// 把 modelKey 放进 PromptRequest）。原来这里走的是 updateSettings + getState
		// 严格校验，对本地 provider 容易误报"模型不可用"：updateSettings 内部用
		// getAvailable() 过滤，而本地 provider 的 hasAuth 在某些时序下不为 true，
		// 模型会被静默忽略；prompt 路径已加 find() 回退，可以兜住这种情况。
		console.log(
			`[BatchTask] Sending prompt for session ${sessionId}, model=${project.modelKey ?? "(session default)"}`,
		);
		await runtime.prompt(sessionId, {
			text: project.prompt,
			...(project.modelKey ? { modelKey: project.modelKey } : {}),
		});
		console.log(`[BatchTask] prompt returned, finalizing task ${task.id}`);

		await finalizeTask(project.id, task.id, runtime);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(`[BatchTask] runTask failed for task ${task.id}: ${errorMessage}`);
		const executing = executingTasks.get(task.id);
		if (executing) clearTimeout(executing.timeoutHandle);
		const failedAt = Date.now();
		const state: BatchTaskState = {
			taskId: task.id,
			status: "failed",
			error: errorMessage,
			sessionId: executing?.sessionId ?? sessionId,
			sessionPath: executing?.sessionPath ?? sessionPath,
			executionMode: executing?.executionMode ?? executionMode,
			completedAt: failedAt,
			lastModified: failedAt,
		};
		await saveTaskState(project.id, task.id, state);
		const capturedStartedAt = executing?.startedAt;
		const capturedModelKey = executing?.modelKey ?? project.modelKey;
		executingTasks.delete(task.id);
		emitBatchTaskEvent({ type: "task.failed", projectId: project.id, taskId: task.id, error: errorMessage });
		await maybeNotifyTaskFinished(
			project.id,
			task.id,
			{ kind: "failed", error: errorMessage },
			capturedStartedAt,
			failedAt,
			capturedModelKey,
		);
	}
}

export async function pauseTask(projectId: string, taskId: string, runtime: RuntimeHost): Promise<void> {
	console.log(`[BatchTask] pauseTask: project=${projectId}, task=${taskId}`);
	// 排队中的任务还没真正启动 session，直接从队列移除即可
	if (removeFromPending(projectId, taskId)) return;
	const executing = executingTasks.get(taskId);
	if (!executing) {
		console.warn(`[BatchTask] pauseTask: task ${taskId} not found in executingTasks`);
		return;
	}

	// 先从 map 中删除，防止 finalizeTask 在 prompt return 后重入
	executingTasks.delete(taskId);
	clearTimeout(executing.timeoutHandle);
	await runtime.abort(executing.sessionId);
	executing.abortController.abort();
	console.log(`[BatchTask] Abort called for session ${executing.sessionId}`);

	const state: BatchTaskState = {
		taskId,
		status: "paused",
		sessionId: executing.sessionId,
		sessionPath: executing.sessionPath,
		executionMode: executing.executionMode,
		lastModified: Date.now(),
	};
	await saveTaskState(projectId, taskId, state);
	emitBatchTaskEvent({ type: "task.paused", projectId, taskId });
	console.log(`[BatchTask] task.paused emitted: ${taskId}`);
}

async function resumeTaskInner(project: BatchProject, task: BatchTask, runtime: RuntimeHost): Promise<void> {
	console.log(`[BatchTask] resumeTask: project=${project.id}, task=${task.id}, session=${task.sessionId}`);
	if (!task.sessionId) {
		console.warn(`[BatchTask] resumeTask: task ${task.id} has no sessionId`);
		return;
	}

	const abortController = new AbortController();
	const executionMode: SessionExecutionMode = task.executionMode ?? "full-access";
	const sessionId = task.sessionId;

	const startedAt = Date.now();
	const timeoutHandle = scheduleTimeout(task.id, runtime);
	executingTasks.set(task.id, {
		projectId: project.id,
		taskId: task.id,
		cwd: task.cwd,
		artifactPatterns: project.artifactPatterns,
		sessionId,
		sessionPath: task.sessionPath,
		executionMode,
		abortController,
		timeoutHandle,
		timedOut: false,
		startedAt,
		modelKey: project.modelKey,
	});

	const runningState: BatchTaskState = {
		taskId: task.id,
		status: "running",
		sessionId,
		sessionPath: task.sessionPath,
		executionMode,
		lastModified: startedAt,
	};
	await saveTaskState(project.id, task.id, runningState);

	emitBatchTaskEvent({ type: "task.resumed", projectId: project.id, taskId: task.id });
	console.log(`[BatchTask] task.resumed emitted: ${task.id}`);

	try {
		console.log(`[BatchTask] Calling continue for session ${sessionId}`);
		await runtime.continue(sessionId);
		console.log(`[BatchTask] continue returned, finalizing task ${task.id}`);

		await finalizeTask(project.id, task.id, runtime);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(`[BatchTask] resumeTask failed for task ${task.id}: ${errorMessage}`);
		const executing = executingTasks.get(task.id);
		if (executing) clearTimeout(executing.timeoutHandle);
		const failedAt = Date.now();
		const state: BatchTaskState = {
			taskId: task.id,
			status: "failed",
			error: errorMessage,
			sessionId,
			sessionPath: task.sessionPath,
			executionMode,
			completedAt: failedAt,
			lastModified: failedAt,
		};
		await saveTaskState(project.id, task.id, state);
		const capturedStartedAt = executing?.startedAt;
		const capturedModelKey = executing?.modelKey ?? project.modelKey;
		executingTasks.delete(task.id);
		emitBatchTaskEvent({ type: "task.failed", projectId: project.id, taskId: task.id, error: errorMessage });
		await maybeNotifyTaskFinished(
			project.id,
			task.id,
			{ kind: "failed", error: errorMessage },
			capturedStartedAt,
			failedAt,
			capturedModelKey,
		);
	}
}

export function isTaskRunning(taskId: string): boolean {
	return executingTasks.has(taskId);
}

export function getExecutingTaskIds(): string[] {
	return Array.from(executingTasks.keys());
}
