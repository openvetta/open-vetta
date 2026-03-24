import type { ChatMessage, ContentBlock, ToolCallBlock } from "../store/atoms";

export function createDraftMessage(): ChatMessage {
	return {
		id: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		role: "assistant",
		text: "",
		blocks: [],
	};
}

export function ensureDraft(
	prev: ChatMessage[],
	draftIdRef: React.MutableRefObject<string | null>,
): [ChatMessage[], number, string] {
	const draftId = draftIdRef.current;
	if (draftId) {
		for (let i = prev.length - 1; i >= 0; i--) {
			if (prev[i].id === draftId) {
				return [[...prev], i, draftId];
			}
		}
	}

	const id = `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	draftIdRef.current = id;
	const draft = createDraftMessage();
	draft.id = id;
	const copy = [...prev, draft];
	return [copy, copy.length - 1, id];
}

export function clearDraftMessage(
	prev: ChatMessage[],
	draftIdRef: React.MutableRefObject<string | null>,
): ChatMessage[] {
	const draftId = draftIdRef.current;
	if (!draftId) return prev;
	const idx = prev.findIndex((m) => m.id === draftId);
	if (idx === -1) return prev;
	const copy = [...prev];
	copy.splice(idx, 1);
	draftIdRef.current = null;
	return copy;
}

export function appendTextDelta(
	prev: ChatMessage[],
	delta: string,
	draftIdRef: React.MutableRefObject<string | null>,
): ChatMessage[] {
	const [msgs, idx] = ensureDraft(prev, draftIdRef);
	const msg = msgs[idx];
	const blocks = [...(msg.blocks ?? [])];
	const last = blocks.at(-1);

	if (last?.type === "text") {
		blocks[blocks.length - 1] = { ...last, text: last.text + delta };
	} else {
		blocks.push({ type: "text", text: delta });
	}

	msgs[idx] = { ...msg, text: msg.text + delta, blocks };
	return msgs;
}

export function appendThinkingDelta(
	prev: ChatMessage[],
	delta: string,
	draftIdRef: React.MutableRefObject<string | null>,
): ChatMessage[] {
	const [msgs, idx] = ensureDraft(prev, draftIdRef);
	const msg = msgs[idx];
	const blocks = [...(msg.blocks ?? [])];
	const last = blocks.at(-1);

	if (last?.type === "thinking") {
		blocks[blocks.length - 1] = { ...last, text: last.text + delta };
	} else {
		blocks.push({ type: "thinking", text: delta });
	}

	msgs[idx] = { ...msg, blocks };
	return msgs;
}

export function handleToolStart(
	prev: ChatMessage[],
	toolCallId: string,
	toolName: string,
	args: Record<string, unknown>,
): ChatMessage[] {
	const lastMsg = prev.length > 0 ? prev[prev.length - 1] : null;

	if (lastMsg?.role === "assistant") {
		const blocks = [...(lastMsg.blocks ?? [])];
		const existing = blocks.findIndex((b) => b.type === "tool_call" && b.toolCallId === toolCallId);
		if (existing !== -1) {
			const block = blocks[existing] as ToolCallBlock;
			if (Object.keys(block.args).length === 0 && Object.keys(args).length > 0) {
				blocks[existing] = { ...block, args };
				const copy = [...prev];
				copy[copy.length - 1] = { ...lastMsg, blocks };
				return copy;
			}
			return prev;
		}

		blocks.push({ type: "tool_call", toolCallId, toolName, args, status: "pending" });
		const copy = [...prev];
		copy[copy.length - 1] = { ...lastMsg, blocks };
		return copy;
	}

	const copy = [...prev];
	copy.push({
		id: `tool-fallback-${Date.now()}`,
		role: "assistant",
		text: "",
		blocks: [{ type: "tool_call", toolCallId, toolName, args, status: "pending" }],
	});
	return copy;
}

export function extractResultText(result: unknown): string {
	if (typeof result === "string") return result;
	if (result && typeof result === "object" && "content" in result) {
		const r = result as { content?: Array<{ type: string; text?: string }> };
		return (r.content ?? [])
			.filter((c) => c.type === "text" && c.text)
			.map((c) => c.text!)
			.join("\n");
	}
	return "";
}

export function handleToolEnd(
	prev: ChatMessage[],
	toolCallId: string,
	result: unknown,
	isError: boolean,
): ChatMessage[] {
	const resultText = extractResultText(result);

	for (let i = prev.length - 1; i >= 0; i--) {
		const msg = prev[i];
		if (msg.role !== "assistant" || !msg.blocks) continue;

		const blockIdx = msg.blocks.findIndex((b) => b.type === "tool_call" && b.toolCallId === toolCallId);
		if (blockIdx === -1) continue;

		const copy = [...prev];
		const blocks = [...msg.blocks];
		const block = blocks[blockIdx] as ToolCallBlock;
		blocks[blockIdx] = { ...block, status: isError ? "error" : "success", result: resultText, isError };
		copy[i] = { ...msg, blocks };
		return copy;
	}
	return prev;
}

export function finalizeMessage(
	prev: ChatMessage[],
	content: unknown,
	draftIdRef: React.MutableRefObject<string | null>,
): ChatMessage[] {
	const copy = [...prev];
	const finalId = `final-${Date.now()}`;

	const contentBlocks: ContentBlock[] = [];
	const finalToolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];

	if (typeof content === "string") {
		if (content) contentBlocks.push({ type: "text", text: content });
	} else if (Array.isArray(content)) {
		for (const part of content as Array<Record<string, unknown>>) {
			if (part.type === "text" && typeof part.text === "string") {
				contentBlocks.push({ type: "text", text: part.text });
			} else if (part.type === "thinking" && typeof part.thinking === "string") {
				contentBlocks.push({ type: "thinking", text: part.thinking });
			} else if (part.type === "toolCall" && typeof part.name === "string") {
				finalToolCalls.push({
					id: String(part.id ?? ""),
					name: String(part.name),
					args: (part.arguments as Record<string, unknown>) ?? {},
				});
			}
		}
	}

	let targetIdx = -1;
	const draftId = draftIdRef.current;
	if (draftId) {
		for (let i = copy.length - 1; i >= 0; i--) {
			if (copy[i].id === draftId) {
				targetIdx = i;
				break;
			}
		}
	}
	if (targetIdx === -1) {
		const newMsg: ChatMessage = { id: finalId, role: "assistant", text: "", blocks: [] };
		copy.push(newMsg);
		targetIdx = copy.length - 1;
	}

	const existingToolBlocks: ToolCallBlock[] = [];
	const existingToolIds = new Set<string>();
	if (targetIdx !== -1) {
		for (const b of copy[targetIdx].blocks ?? []) {
			if (b.type === "tool_call") {
				existingToolBlocks.push(b);
				existingToolIds.add(b.toolCallId);
			}
		}
	}

	for (const tc of finalToolCalls) {
		if (existingToolIds.has(tc.id)) {
			const existing = existingToolBlocks.find((b) => b.toolCallId === tc.id);
			if (existing) existing.args = tc.args;
		} else {
			existingToolBlocks.push({
				type: "tool_call",
				toolCallId: tc.id,
				toolName: tc.name,
				args: tc.args,
				status: "pending",
			});
		}
	}

	const finalBlocks: ContentBlock[] = [...contentBlocks, ...existingToolBlocks];
	const text = contentBlocks
		.filter((b) => b.type === "text")
		.map((b) => b.text)
		.join("");

	if (targetIdx !== -1) {
		copy[targetIdx] = { ...copy[targetIdx], id: finalId, text, blocks: finalBlocks };
	} else {
		copy.push({ id: finalId, role: "assistant", text, blocks: finalBlocks });
	}

	draftIdRef.current = null;
	return copy;
}
