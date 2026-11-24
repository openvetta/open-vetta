import { type AssistantMessage, type AssistantMessageEvent, createAssistantMessage } from "@vetta/ai";
import type { SessionEvent } from "@vetta/runtime-core";

/**
 * Shared stub for renderer IPC. `text_delta` / `thinking_delta` consumers only
 * read `delta`; structured-clone of the growing `partial` is the hot-path cost.
 */
export const SLIM_ASSISTANT_PARTIAL: AssistantMessage = Object.freeze(
	createAssistantMessage({ api: "openai-completions", provider: "vetta-ipc", model: "slim" }, { timestamp: 0 }),
);

type ToolCallStreamEvent = Extract<
	AssistantMessageEvent,
	{ type: "toolcall_start" | "toolcall_delta" | "toolcall_end" }
>;

/**
 * Renderer tool-call consumers read only `partial.content[contentIndex]`. Keeping the
 * whole partial would re-clone every earlier text and thinking block on each argument
 * delta, so the slim copy is a sparse array holding just that one block.
 */
function slimToolCallPartial(event: ToolCallStreamEvent): AssistantMessage {
	const content: AssistantMessage["content"] = new Array(event.contentIndex + 1);
	const block = event.partial.content[event.contentIndex];
	if (block) content[event.contentIndex] = block;
	return { ...SLIM_ASSISTANT_PARTIAL, content };
}

/**
 * Drops the growing `partial` from streaming assistant events sent to a renderer, keeping
 * only what renderer reducers read. Used by chat sessions and Team member streams alike.
 */
export function slimAssistantEventForIpc<T extends AssistantMessageEvent>(event: T): T {
	if (event.type === "toolcall_start" || event.type === "toolcall_delta" || event.type === "toolcall_end") {
		if (event.partial.provider === SLIM_ASSISTANT_PARTIAL.provider) return event;
		return { ...event, partial: slimToolCallPartial(event) };
	}
	if (event.type === "text_delta" || event.type === "thinking_delta") {
		if (event.partial === SLIM_ASSISTANT_PARTIAL) return event;
		return { ...event, partial: SLIM_ASSISTANT_PARTIAL };
	}
	return event;
}

export function slimSessionEventForIpc(event: SessionEvent): SessionEvent {
	if (event.channel !== "assistant") return event;
	return slimAssistantEventForIpc(event);
}
