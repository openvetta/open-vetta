import type { PluginOfficialSkillInfo } from "@vetta-org/plugin-sdk";
import { hasRunningTask, setTaskStatus, type PluginState } from "./state";

export type RunTaskNotice = "no-project" | null;

export const IMPLEMENT_SKILL = "implement";

export function selectBoardRunSkills(list: readonly PluginOfficialSkillInfo[]): PluginOfficialSkillInfo[] {
	return list
		.filter((skill) => skill.type === "skill" && Reflect.get(skill, "enabled") !== false)
		.slice()
		.sort((left, right) => left.name.localeCompare(right.name));
}

export function filterBoardRunSkills(
	skills: readonly PluginOfficialSkillInfo[],
	query: string,
): PluginOfficialSkillInfo[] {
	const needle = query.trim().toLowerCase();
	if (!needle) return skills.slice();
	return skills.filter((skill) => {
		const haystack = [skill.name, skill.alias ?? "", skill.description].join("\n").toLowerCase();
		return haystack.includes(needle);
	});
}

export interface BoardSessionPort {
	create(input: { cwd: string; title?: string }): Promise<{ sessionId: string; sessionPath: string }>;
	prompt(
		sessionId: string,
		text: string,
	): Promise<{ status: "sent" | "queued" | "failed"; error?: { message: string } }>;
	abort(sessionId: string): Promise<void>;
	onRunningChanged(
		handler: (event: { sessionPath: string; running: boolean; sessionId?: string }) => void,
	): () => void;
}

export interface RunQueuedTaskInput {
	state: PluginState;
	taskId: string;
	sessions: BoardSessionPort;
	cwd: string | null;
	now: () => number;
	persist?: (state: PluginState) => void | Promise<void>;
	/** When set, prefix the sent prompt with `@skill:<name>` without persisting it. */
	skill?: string | null;
	/** Sent text before the skill prefix; defaults to the stored task prompt. */
	sendPromptText?: string;
	signal?: AbortSignal;
	stoppedError?: string;
}

export interface FollowRunningTaskInput {
	state: PluginState;
	taskId: string;
	sessions: BoardSessionPort;
	now: () => number;
	persist?: (state: PluginState) => void | Promise<void>;
	signal?: AbortSignal;
	stoppedError?: string;
	runtimeSessionId?: string;
}

export function promptForRun(promptText: string, skill?: string | null): string {
	const name = skill?.trim() ?? "";
	if (!name) return promptText;
	const token = `@skill:${name}`;
	if (promptText === token || promptText.startsWith(`${token} `) || promptText.startsWith(`${token}\n`)) {
		return promptText;
	}
	return `${token} ${promptText}`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

const ABORTED = "aborted-locally";
const runtimeIdByPath = new Map<string, string>();
let boardRunEpoch = 0;

export function detachBoardRuns(): void {
	boardRunEpoch += 1;
}

function rememberRuntimeId(sessionPath: string, sessionId: string): void {
	runtimeIdByPath.set(sessionPath, sessionId);
}

function forgetRuntimeId(sessionPath: string): void {
	runtimeIdByPath.delete(sessionPath);
}

function persistIfCurrent(
	persist: RunQueuedTaskInput["persist"],
	epoch: number,
): RunQueuedTaskInput["persist"] {
	if (!persist) return persist;
	return (state) => {
		if (epoch !== boardRunEpoch) return;
		return persist(state);
	};
}

function whenAborted(signal: AbortSignal): Promise<typeof ABORTED> {
	return new Promise((resolve) => {
		if (signal.aborted) {
			resolve(ABORTED);
			return;
		}
		signal.addEventListener("abort", () => resolve(ABORTED), { once: true });
	});
}

async function abortSession(sessions: BoardSessionPort, sessionId: string | undefined): Promise<void> {
	if (!sessionId) return;
	try {
		await sessions.abort(sessionId);
	} catch {
		// The session may already be gone.
	}
}

function watchSessionIdle(
	sessions: BoardSessionPort,
	sessionPath: string,
	runtimeId: { current: string | undefined },
	signal?: AbortSignal,
): { promise: Promise<"idle" | typeof ABORTED>; dispose: () => void } {
	let settled = false;
	let disposeListener = (): void => undefined;
	let onAbort = (): void => undefined;
	const promise = new Promise<"idle" | typeof ABORTED>((resolve) => {
		const finish = (value: "idle" | typeof ABORTED): void => {
			if (settled) return;
			settled = true;
			disposeListener();
			signal?.removeEventListener("abort", onAbort);
			resolve(value);
		};
		onAbort = (): void => finish(ABORTED);
		disposeListener = sessions.onRunningChanged((event) => {
			if (event.sessionPath !== sessionPath) return;
			if (event.sessionId) {
				runtimeId.current = event.sessionId;
				rememberRuntimeId(sessionPath, event.sessionId);
			}
			if (!event.running) finish("idle");
		});
		if (signal?.aborted) {
			finish(ABORTED);
			return;
		}
		signal?.addEventListener("abort", onAbort, { once: true });
	});
	return {
		promise,
		dispose: () => {
			if (settled) return;
			settled = true;
			disposeListener();
			signal?.removeEventListener("abort", onAbort);
		},
	};
}

export async function runQueuedTask(input: RunQueuedTaskInput): Promise<{
	state: PluginState;
	notice: RunTaskNotice;
}> {
	const { sessions, cwd, now, taskId } = input;
	if (!cwd) return { state: input.state, notice: "no-project" };

	const task = input.state.tasks.find((item) => item.id === taskId);
	if (!task || task.status !== "pending" || hasRunningTask(input.state)) {
		return { state: input.state, notice: null };
	}

	const epoch = boardRunEpoch;
	const persist = persistIfCurrent(input.persist, epoch);
	let current = setTaskStatus(input.state, taskId, { status: "running", now: now() });
	await persist?.(current);

	const runtimeId: { current: string | undefined } = { current: undefined };
	let watch: { promise: Promise<"idle" | typeof ABORTED>; dispose: () => void } | null = null;
	try {
		const session = await sessions.create({ cwd, title: task.title });
		runtimeId.current = session.sessionId;
		const sessionPath = session.sessionPath.trim();
		if (sessionPath) {
			rememberRuntimeId(sessionPath, session.sessionId);
			current = setTaskStatus(current, taskId, { status: "running", sessionId: sessionPath, now: now() });
			await persist?.(current);
			watch = watchSessionIdle(sessions, sessionPath, runtimeId, input.signal);
		}
		const sendPrompt = sessions.prompt(
			session.sessionId,
			promptForRun(input.sendPromptText ?? task.promptText, input.skill),
		);
		const sent = input.signal ? await Promise.race([sendPrompt, whenAborted(input.signal)]) : await sendPrompt;
		if (sent === ABORTED) {
			await abortSession(sessions, runtimeId.current);
			current = setTaskStatus(current, taskId, {
				status: "failed",
				error: input.stoppedError ?? "Stopped",
				now: now(),
			});
			await persist?.(current);
			return { state: current, notice: null };
		}
		if (sent.status === "failed") {
			current = setTaskStatus(current, taskId, {
				status: "failed",
				error: sent.error?.message ?? "failed",
				now: now(),
			});
			await persist?.(current);
			return { state: current, notice: null };
		}
		if (!watch) {
			current = setTaskStatus(current, taskId, { status: "completed", now: now() });
			await persist?.(current);
			return { state: current, notice: null };
		}
		const outcome = await watch.promise;
		if (outcome === ABORTED) {
			await abortSession(sessions, runtimeId.current);
			current = setTaskStatus(current, taskId, {
				status: "failed",
				error: input.stoppedError ?? "Stopped",
				now: now(),
			});
			await persist?.(current);
			return { state: current, notice: null };
		}
		current = setTaskStatus(current, taskId, { status: "completed", now: now() });
		await persist?.(current);
		return { state: current, notice: null };
	} catch (error) {
		current = setTaskStatus(current, taskId, {
			status: "failed",
			error: errorMessage(error),
			now: now(),
		});
		await persist?.(current);
		return { state: current, notice: null };
	} finally {
		watch?.dispose();
		if (epoch === boardRunEpoch) {
			const path = current.tasks.find((item) => item.id === taskId)?.sessionId;
			if (path) forgetRuntimeId(path);
		}
	}
}

export async function followRunningTask(input: FollowRunningTaskInput): Promise<{ state: PluginState }> {
	const task = input.state.tasks.find((item) => item.id === input.taskId);
	const sessionPath = task?.sessionId?.trim();
	if (!task || task.status !== "running" || !sessionPath) {
		return { state: input.state };
	}

	const epoch = boardRunEpoch;
	const persist = persistIfCurrent(input.persist, epoch);
	const runtimeId: { current: string | undefined } = {
		current: input.runtimeSessionId ?? runtimeIdByPath.get(sessionPath),
	};
	const watch = watchSessionIdle(input.sessions, sessionPath, runtimeId, input.signal);
	try {
		const outcome = await watch.promise;
		if (outcome === ABORTED) {
			await abortSession(input.sessions, runtimeId.current);
			const failed = setTaskStatus(input.state, input.taskId, {
				status: "failed",
				error: input.stoppedError ?? "Stopped",
				now: input.now(),
			});
			await persist?.(failed);
			return { state: failed };
		}
		const completed = setTaskStatus(input.state, input.taskId, { status: "completed", now: input.now() });
		await persist?.(completed);
		return { state: completed };
	} finally {
		watch.dispose();
		if (epoch === boardRunEpoch) forgetRuntimeId(sessionPath);
	}
}
