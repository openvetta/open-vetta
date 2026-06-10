/**
 * Background task manager for long-running bash commands.
 *
 * The bash tool spawns background tasks here when `run_in_background` is set.
 * Each task runs detached from the agent loop: output is streamed to a log
 * file on disk, and a completion notification is dispatched (via the
 * `onNotify` hook wired by AgentSession) so the agent can react when done.
 *
 * Lifecycle is bound to the owning session: AgentSession.dispose() kills all
 * still-running tasks.
 */

import { randomBytes } from "node:crypto";
import { createWriteStream, type WriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ChildProcess, spawn } from "child_process";
import stripAnsi from "strip-ansi";
import {
	getDefaultShellCommandPrefix,
	getShellConfig,
	killProcessTree,
	prependCommandPrefixes,
	sanitizeBinaryOutput,
} from "../../utils/shell.js";

export type BackgroundTaskStatus = "running" | "completed" | "failed" | "killed";

/** Serializable task state, safe to send over IPC to UI layers. */
export interface BackgroundTaskSnapshot {
	id: string;
	command: string;
	cwd: string;
	status: BackgroundTaskStatus;
	outputFile: string;
	exitCode: number | undefined;
	startedAt: number;
	endedAt?: number;
	toolCallId?: string;
	/** Rolling tail of sanitized output (last ~2KB) for live UI display. */
	tail: string;
}

export type BackgroundTaskEvent =
	| { type: "task_started"; task: BackgroundTaskSnapshot }
	| { type: "task_output"; task: BackgroundTaskSnapshot }
	| { type: "task_ended"; task: BackgroundTaskSnapshot };

export type BackgroundTaskListener = (event: BackgroundTaskEvent) => void;

export interface SpawnBackgroundTaskOptions {
	command: string;
	cwd: string;
	env: NodeJS.ProcessEnv;
	toolCallId?: string;
}

interface InternalTask {
	snapshot: BackgroundTaskSnapshot;
	child: ChildProcess;
	stream: WriteStream;
	/** Read cursor for the task_output tool (bytes into the sanitized log). */
	readOffset: number;
	/** Bytes written to the log file so far. */
	writtenBytes: number;
	/** Guards against double end (close + error both firing). */
	ended: boolean;
	/** Guards against duplicate completion notifications. */
	notified: boolean;
	outputTimer?: NodeJS.Timeout;
}

const TAIL_MAX_CHARS = 2048;
const OUTPUT_EVENT_THROTTLE_MS = 200;

export class BackgroundTaskManager {
	private tasks = new Map<string, InternalTask>();
	private listeners: BackgroundTaskListener[] = [];
	private counter = 0;

	/**
	 * Completion notification hook, wired by AgentSession to inject a
	 * <task-notification> message back into the agent loop. Fired at most once
	 * per task (notified flag).
	 */
	onNotify?: (task: BackgroundTaskSnapshot) => void;

	subscribe(listener: BackgroundTaskListener): () => void {
		this.listeners.push(listener);
		return () => {
			const index = this.listeners.indexOf(listener);
			if (index !== -1) this.listeners.splice(index, 1);
		};
	}

	private emit(event: BackgroundTaskEvent): void {
		for (const l of this.listeners) l(event);
	}

	/** Spawn a detached background command. Returns the initial snapshot. */
	spawn(options: SpawnBackgroundTaskOptions): BackgroundTaskSnapshot {
		const id = `b${++this.counter}`;
		const outputFile = join(tmpdir(), `vetta-task-${id}-${randomBytes(4).toString("hex")}.log`);
		const stream = createWriteStream(outputFile);

		const { shell, args } = getShellConfig();
		const resolvedCommand = prependCommandPrefixes(options.command, [getDefaultShellCommandPrefix(shell)]);
		const child = spawn(shell, [...args, resolvedCommand], {
			cwd: options.cwd,
			detached: process.platform !== "win32",
			env: options.env,
			stdio: ["ignore", "pipe", "pipe"],
		});

		const task: InternalTask = {
			snapshot: {
				id,
				command: options.command,
				cwd: options.cwd,
				status: "running",
				outputFile,
				exitCode: undefined,
				startedAt: Date.now(),
				toolCallId: options.toolCallId,
				tail: "",
			},
			child,
			stream,
			readOffset: 0,
			writtenBytes: 0,
			ended: false,
			notified: false,
		};
		this.tasks.set(id, task);

		const decoder = new TextDecoder();
		const handleData = (data: Buffer) => {
			// Sanitize at the source, same as the foreground bash executor.
			const text = sanitizeBinaryOutput(stripAnsi(decoder.decode(data, { stream: true }))).replace(/\r/g, "");
			if (!text) return;
			task.stream.write(text);
			task.writtenBytes += Buffer.byteLength(text, "utf-8");
			task.snapshot.tail = (task.snapshot.tail + text).slice(-TAIL_MAX_CHARS);
			this.scheduleOutputEvent(task);
		};
		child.stdout?.on("data", handleData);
		child.stderr?.on("data", handleData);

		child.on("close", (code) => {
			this.finish(task, code === null ? "killed" : code === 0 ? "completed" : "failed", code ?? undefined);
		});
		child.on("error", (err) => {
			const text = `\nFailed to spawn command: ${err.message}\n`;
			task.stream.write(text);
			task.writtenBytes += Buffer.byteLength(text, "utf-8");
			task.snapshot.tail = (task.snapshot.tail + text).slice(-TAIL_MAX_CHARS);
			this.finish(task, "failed", undefined);
		});

		this.emit({ type: "task_started", task: { ...task.snapshot } });
		return { ...task.snapshot };
	}

	private scheduleOutputEvent(task: InternalTask): void {
		if (task.outputTimer || task.ended) return;
		task.outputTimer = setTimeout(() => {
			task.outputTimer = undefined;
			if (!task.ended) this.emit({ type: "task_output", task: { ...task.snapshot } });
		}, OUTPUT_EVENT_THROTTLE_MS);
	}

	private finish(task: InternalTask, status: BackgroundTaskStatus, exitCode: number | undefined): void {
		if (task.ended) return;
		task.ended = true;
		if (task.outputTimer) {
			clearTimeout(task.outputTimer);
			task.outputTimer = undefined;
		}
		task.stream.end();
		task.snapshot.status = status;
		task.snapshot.exitCode = exitCode;
		task.snapshot.endedAt = Date.now();

		this.emit({ type: "task_ended", task: { ...task.snapshot } });

		if (!task.notified && this.onNotify) {
			task.notified = true;
			this.onNotify({ ...task.snapshot });
		}
	}

	get(taskId: string): BackgroundTaskSnapshot | undefined {
		const task = this.tasks.get(taskId);
		return task ? { ...task.snapshot } : undefined;
	}

	list(): BackgroundTaskSnapshot[] {
		return Array.from(this.tasks.values()).map((t) => ({ ...t.snapshot }));
	}

	/** Whether any task is still running. */
	get runningCount(): number {
		let count = 0;
		for (const t of this.tasks.values()) {
			if (t.snapshot.status === "running") count++;
		}
		return count;
	}

	/**
	 * Read cursor management for the task_output tool: returns the current
	 * read offset and advances it to the end of what has been written so far.
	 */
	consumeReadOffset(taskId: string): { offset: number; end: number } | undefined {
		const task = this.tasks.get(taskId);
		if (!task) return undefined;
		const result = { offset: task.readOffset, end: task.writtenBytes };
		task.readOffset = task.writtenBytes;
		return result;
	}

	/** Kill a running task's process tree. Returns false if not found or already ended. */
	kill(taskId: string): boolean {
		const task = this.tasks.get(taskId);
		if (!task || task.ended) return false;
		if (task.child.pid) {
			killProcessTree(task.child.pid);
		} else {
			task.child.kill();
		}
		return true;
	}

	/** Kill all running tasks. Called on session dispose. */
	killAll(): void {
		for (const task of this.tasks.values()) {
			if (!task.ended && task.child.pid) {
				killProcessTree(task.child.pid);
			}
		}
	}
}

/** Build the <task-notification> XML injected into the agent loop on completion. */
export function buildTaskNotification(task: BackgroundTaskSnapshot): string {
	const statusText =
		task.status === "completed"
			? `completed (exit code ${task.exitCode ?? 0})`
			: task.status === "killed"
				? "was killed"
				: `failed (exit code ${task.exitCode ?? "unknown"})`;
	const summary = `Background command "${task.command}" ${statusText}`;
	return [
		"<task-notification>",
		`<task-id>${task.id}</task-id>`,
		...(task.toolCallId ? [`<tool-use-id>${task.toolCallId}</tool-use-id>`] : []),
		`<status>${task.status}</status>`,
		`<output-file>${task.outputFile}</output-file>`,
		`<summary>${summary}</summary>`,
		"</task-notification>",
		"",
		"Use the task_output tool to read the command output if needed.",
	].join("\n");
}
