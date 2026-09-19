import type { ConversationEvent, PluginConversationApi } from "@vetta-org/plugin-sdk";
import { hasRunningTask, setTaskStatus, type PluginState } from "./state";

export type RunTaskNotice = "no-project" | null;

export const IMPLEMENT_SKILL = "implement";

export interface RunQueuedTaskInput {
	state: PluginState;
	taskId: string;
	conversation: PluginConversationApi;
	cwd: string | null;
	now: () => number;
	persist?: (state: PluginState) => void | Promise<void>;
	/** When set, prefix the sent prompt with `@skill:<name>` without persisting it. */
	skill?: string | null;
	signal?: AbortSignal;
	stoppedError?: string;
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

function waitForTurnEnd(conversation: PluginConversationApi): {
	promise: Promise<string>;
	dispose: () => void;
} {
	let dispose = (): void => undefined;
	const promise = new Promise<string>((resolve) => {
		const subscription = conversation.on((event: ConversationEvent) => {
			if (event.type !== "turn-end") return;
			subscription.dispose();
			resolve(event.stopReason);
		});
		dispose = () => subscription.dispose();
	});
	return { promise, dispose };
}

const ABORTED = "aborted-locally";

function whenAborted(signal: AbortSignal): Promise<typeof ABORTED> {
	return new Promise((resolve) => {
		if (signal.aborted) {
			resolve(ABORTED);
			return;
		}
		signal.addEventListener("abort", () => resolve(ABORTED), { once: true });
	});
}

async function abortConversation(conversation: PluginConversationApi): Promise<void> {
	try {
		await conversation.abort();
	} catch {
		// The session may already be gone.
	}
}

async function sendAndWait(
	conversation: PluginConversationApi,
	promptText: string,
	signal?: AbortSignal,
): Promise<string> {
	const turnEnd = waitForTurnEnd(conversation);
	try {
		const sendPrompt = conversation.sendPrompt(promptText);
		const sent = signal ? await Promise.race([sendPrompt, whenAborted(signal)]) : await sendPrompt;
		if (sent === ABORTED) {
			await abortConversation(conversation);
			return ABORTED;
		}
		if (sent.status === "failed") {
			throw new Error(sent.error?.message ?? "failed");
		}
		const stopReason = signal
			? await Promise.race([turnEnd.promise, whenAborted(signal)])
			: await turnEnd.promise;
		if (stopReason === ABORTED) {
			await abortConversation(conversation);
			return ABORTED;
		}
		return stopReason;
	} finally {
		turnEnd.dispose();
	}
}

export async function runQueuedTask(input: RunQueuedTaskInput): Promise<{
	state: PluginState;
	notice: RunTaskNotice;
}> {
	const { conversation, cwd, now, persist, taskId } = input;
	if (!cwd) return { state: input.state, notice: "no-project" };

	const task = input.state.tasks.find((item) => item.id === taskId);
	if (!task || task.status !== "pending" || hasRunningTask(input.state)) {
		return { state: input.state, notice: null };
	}

	let current = setTaskStatus(input.state, taskId, { status: "running", now: now() });
	await persist?.(current);

	try {
		const session = await conversation.createSession(cwd);
		const sessionPath = session.sessionPath?.trim() || session.id?.trim() || undefined;
		if (sessionPath) {
			current = setTaskStatus(current, taskId, { status: "running", sessionId: sessionPath, now: now() });
			await persist?.(current);
		}
		const stopReason = await sendAndWait(conversation, promptForRun(task.promptText, input.skill), input.signal);
		current = setTaskStatus(current, taskId, {
			status: stopReason === "stop" ? "completed" : "failed",
			...(stopReason === "stop"
				? {}
				: { error: stopReason === ABORTED ? (input.stoppedError ?? "Stopped") : stopReason }),
			now: now(),
		});
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
	}
}
