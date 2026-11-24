import type { AssistantSessionEvent, SessionEvent } from "@vetta/runtime-core";

type ToolCallDeltaEvent = Extract<AssistantSessionEvent, { type: "toolcall_delta" }>;

export interface ToolCallDeltaCoalescer {
	push(event: SessionEvent): void;
	/** Drops a pending delta without sending it; the subscription is gone. */
	dispose(): void;
}

export interface ToolCallDeltaCoalescerOptions {
	readonly intervalMs?: number;
	readonly setTimer?: (callback: () => void, ms: number) => unknown;
	readonly clearTimer?: (handle: unknown) => void;
}

/** Long enough to cut a large write's thousands of argument deltas to a few dozen sends. */
export const TOOL_CALL_DELTA_INTERVAL_MS = 50;

function isToolCallDelta(event: SessionEvent): event is ToolCallDeltaEvent {
	return event.channel === "assistant" && event.type === "toolcall_delta";
}

function sameToolCall(a: ToolCallDeltaEvent, b: ToolCallDeltaEvent): boolean {
	return a.turnId === b.turnId && a.modelCallIndex === b.modelCallIndex && a.contentIndex === b.contentIndex;
}

/**
 * Each tool-call delta carries the arguments parsed so far, so only the latest one of
 * a burst matters to the renderer. Sending every delta makes a large `write` cost
 * quadratic structured-clone work on the main thread. Deltas of one call are held for
 * at most `intervalMs` and sent as one event whose `delta` joins the skipped chunks;
 * any other event flushes the held delta first, so ordering is unchanged.
 */
export function createToolCallDeltaCoalescer(
	send: (event: SessionEvent) => void,
	options: ToolCallDeltaCoalescerOptions = {},
): ToolCallDeltaCoalescer {
	const intervalMs = options.intervalMs ?? TOOL_CALL_DELTA_INTERVAL_MS;
	const setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
	const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
	let pending: ToolCallDeltaEvent | null = null;
	let timer: unknown = null;

	const cancelTimer = (): void => {
		if (timer === null) return;
		clearTimer(timer);
		timer = null;
	};

	const flush = (): void => {
		cancelTimer();
		const event = pending;
		pending = null;
		if (event) send(event);
	};

	return {
		push(event) {
			if (!isToolCallDelta(event)) {
				flush();
				send(event);
				return;
			}
			if (pending && sameToolCall(pending, event)) {
				pending = { ...event, delta: `${pending.delta}${event.delta}` };
				return;
			}
			flush();
			pending = event;
			timer = setTimer(flush, intervalMs);
		},
		dispose() {
			cancelTimer();
			pending = null;
		},
	};
}
