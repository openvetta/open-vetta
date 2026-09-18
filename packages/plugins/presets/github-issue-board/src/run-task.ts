import type { ConversationEvent, PluginConversationApi } from "@vetta-org/plugin-sdk";
import { hasRunningTask, setTaskStatus, type PluginState } from "./state";

export type RunTaskNotice = "no-project" | null;

export interface RunQueuedTaskInput {
	state: PluginState;
	taskId: string;
	conversation: PluginConversationApi;
	cwd: string | null;
	now: () => number;
	persist?: (state: PluginState) => void | Promise<void>;
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

async function sendAndWait(conversation: PluginConversationApi, promptText: string): Promise<string> {
	const turnEnd = waitForTurnEnd(conversation);
	try {
		const result = await conversation.sendPrompt(promptText);
		if (result.status === "failed") {
			throw new Error(result.error?.message ?? "failed");
		}
		return await turnEnd.promise;
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
		const stopReason = await sendAndWait(conversation, task.promptText);
		current = setTaskStatus(current, taskId, {
			status: stopReason === "stop" ? "completed" : "failed",
			...(stopReason === "stop" ? {} : { error: stopReason }),
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
