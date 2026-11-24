import { type AssistantMessage, createAssistantMessage } from "@vetta/ai";
import type { AssistantSessionEvent, SessionEvent } from "@vetta/runtime-core";
import { describe, expect, it } from "vitest";
import { decodeSessionEvent } from "../../shared/session-event-codec.js";
import { SLIM_ASSISTANT_PARTIAL, slimSessionEventForIpc } from "./slim-session-event-for-ipc.js";

function fatPartial(): AssistantMessage {
	return {
		...createAssistantMessage(
			{ api: "openai-completions", provider: "openai", model: "gpt-test" },
			{ timestamp: 10 },
		),
		content: [{ type: "text", text: "hello ".repeat(2_000) }],
	};
}

function assistantDelta(
	type: "text_delta" | "thinking_delta" | "toolcall_delta",
	partial: AssistantMessage,
): AssistantSessionEvent {
	return {
		schemaVersion: 1,
		sessionId: "session-1",
		eventId: "event-1",
		timestamp: 10,
		source: "agent",
		sequence: 3,
		channel: "assistant",
		turnId: "turn-1",
		modelCallIndex: 0,
		type,
		contentIndex: 0,
		delta: "x",
		partial,
	};
}

describe("slimSessionEventForIpc", () => {
	it("strips growing text and thinking partials while keeping the delta for the renderer", () => {
		const partial = fatPartial();
		const textEvent = assistantDelta("text_delta", partial);
		const slimed = slimSessionEventForIpc(textEvent);

		expect(slimed).not.toBe(textEvent);
		if (textEvent.type !== "text_delta") throw new Error("expected assistant text_delta");
		expect(textEvent.partial).toBe(partial);
		expect(slimed).toMatchObject({ type: "text_delta", delta: "x" });
		if (slimed.channel !== "assistant" || slimed.type !== "text_delta") {
			throw new Error("expected assistant text_delta");
		}
		expect(slimed.partial).toBe(SLIM_ASSISTANT_PARTIAL);
		expect(decodeSessionEvent(slimed)).toBe(slimed);

		const thinking = slimSessionEventForIpc(assistantDelta("thinking_delta", partial));
		if (thinking.channel !== "assistant" || thinking.type !== "thinking_delta") {
			throw new Error("expected assistant thinking_delta");
		}
		expect(thinking.partial).toBe(SLIM_ASSISTANT_PARTIAL);
		expect(decodeSessionEvent(thinking)).toBe(thinking);
	});

	it("keeps only the streaming tool-call block in tool-call partials", () => {
		const toolCall = { type: "toolCall" as const, id: "call-1", name: "write", arguments: { path: "a.ts" } };
		const partial: AssistantMessage = {
			...fatPartial(),
			content: [{ type: "thinking", thinking: "plan ".repeat(2_000) }, { type: "text", text: "hi" }, toolCall],
		};
		const toolEvent = { ...assistantDelta("toolcall_delta", partial), contentIndex: 2 };
		const slimed = slimSessionEventForIpc(toolEvent);
		if (slimed.channel !== "assistant" || slimed.type !== "toolcall_delta") {
			throw new Error("expected assistant toolcall_delta");
		}
		expect(slimed.partial.content[2]).toBe(toolCall);
		expect(slimed.partial.content).toHaveLength(3);
		expect(0 in slimed.partial.content).toBe(false);
		expect(1 in slimed.partial.content).toBe(false);
		expect(partial.content).toHaveLength(3);
		expect(decodeSessionEvent(slimed)).toBe(slimed);
		expect(slimSessionEventForIpc(slimed)).toBe(slimed);
	});

	it("keeps non-assistant events intact", () => {
		const runtimeEvent: SessionEvent = {
			schemaVersion: 1,
			sessionId: "session-1",
			eventId: "event-2",
			timestamp: 11,
			source: "tool",
			type: "tool.phase",
			toolCallId: "call-1",
			toolName: "bash",
			label: "plain",
			atMs: 1,
		};
		expect(slimSessionEventForIpc(runtimeEvent)).toBe(runtimeEvent);
	});
});
