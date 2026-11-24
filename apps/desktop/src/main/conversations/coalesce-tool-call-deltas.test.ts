import { createAssistantMessage } from "@vetta/ai";
import type { AssistantSessionEvent, SessionEvent } from "@vetta/runtime-core";
import { describe, expect, it } from "vitest";
import { createToolCallDeltaCoalescer } from "./coalesce-tool-call-deltas.js";

const partial = createAssistantMessage({ api: "openai-completions", provider: "openai", model: "m" }, { timestamp: 0 });

function event(
	type: "toolcall_delta" | "text_delta" | "toolcall_end",
	delta: string,
	contentIndex = 0,
): AssistantSessionEvent {
	const base = {
		schemaVersion: 1 as const,
		sessionId: "s",
		eventId: `e-${delta}`,
		timestamp: 1,
		source: "agent" as const,
		sequence: 1,
		channel: "assistant" as const,
		turnId: "t",
		modelCallIndex: 0,
		contentIndex,
		partial,
	};
	if (type === "toolcall_end") {
		return { ...base, type, toolCall: { type: "toolCall", id: "c", name: "write", arguments: {} } };
	}
	return { ...base, type, delta };
}

function harness() {
	const sent: SessionEvent[] = [];
	const timers: Array<() => void> = [];
	const coalescer = createToolCallDeltaCoalescer((e) => sent.push(e), {
		setTimer: (callback) => {
			timers.push(callback);
			return timers.length;
		},
		clearTimer: () => {},
	});
	return { sent, timers, coalescer };
}

function deltas(events: SessionEvent[]): string[] {
	return events.map((e) => (e.channel === "assistant" && "delta" in e ? `${e.type}:${e.delta}` : e.type));
}

describe("createToolCallDeltaCoalescer", () => {
	it("sends a burst of one call's deltas as the latest event with joined deltas", () => {
		const { sent, timers, coalescer } = harness();
		coalescer.push(event("toolcall_delta", "a"));
		coalescer.push(event("toolcall_delta", "b"));
		coalescer.push(event("toolcall_delta", "c"));
		expect(sent).toEqual([]);
		timers[0]?.();
		expect(deltas(sent)).toEqual(["toolcall_delta:abc"]);
		expect(sent[0]?.eventId).toBe("e-c");
	});

	it("flushes the held delta before any other event so order is kept", () => {
		const { sent, coalescer } = harness();
		coalescer.push(event("toolcall_delta", "a"));
		coalescer.push(event("toolcall_end", ""));
		coalescer.push(event("text_delta", "x"));
		expect(deltas(sent)).toEqual(["toolcall_delta:a", "toolcall_end", "text_delta:x"]);
	});

	it("does not merge deltas of different tool calls", () => {
		const { sent, coalescer } = harness();
		coalescer.push(event("toolcall_delta", "a", 0));
		coalescer.push(event("toolcall_delta", "b", 1));
		expect(deltas(sent)).toEqual(["toolcall_delta:a"]);
	});

	it("drops a held delta after dispose", () => {
		const { sent, timers, coalescer } = harness();
		coalescer.push(event("toolcall_delta", "a"));
		coalescer.dispose();
		timers[0]?.();
		expect(sent).toEqual([]);
	});
});
