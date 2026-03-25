import type { ChatMessage, ContentBlock, ToolCallBlock } from "@shared/store/atoms";

// ═══════════════════════════════════════════════════════════════════════════════
// Message conversion helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Extract plain text from a message content (string or content-part array). */
export function extractText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return (content as Array<{ type: string; text?: string }>)
		.filter((p) => p.type === "text" && typeof p.text === "string")
		.map((p) => p.text!)
		.join("");
}

/** Extract text from an array of result content blocks. */
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

/**
 * Convert a stored assistant message's content array into ContentBlock[].
 * Used for history loading only — tool_call blocks get status "success"
 * because history messages are already complete.
 */
export function messageToBlocks(content: unknown): ContentBlock[] {
	if (typeof content === "string") {
		return content ? [{ type: "text", text: content }] : [];
	}
	if (!Array.isArray(content)) return [];
	const blocks: ContentBlock[] = [];
	for (const part of content as Array<Record<string, unknown>>) {
		if (part.type === "text" && typeof part.text === "string") {
			blocks.push({ type: "text", text: part.text });
		} else if (part.type === "thinking" && typeof part.thinking === "string") {
			blocks.push({ type: "thinking", text: part.thinking });
		} else if (part.type === "toolCall" && typeof part.name === "string") {
			blocks.push({
				type: "tool_call",
				toolCallId: String(part.id ?? ""),
				toolName: String(part.name),
				args: (part.arguments as Record<string, unknown>) ?? {},
				status: "success",
			});
		}
	}
	return blocks;
}

/**
 * Convert history messages (user, assistant, toolResult) into ChatMessages.
 * Tool results are merged into their corresponding tool_call blocks.
 */
export function historyToChat(
	history: Array<{
		role: string;
		content: unknown;
		toolCallId?: string;
		toolName?: string;
		isError?: boolean;
	}>,
): ChatMessage[] {
	const messages: ChatMessage[] = [];
	const toolCallIndex = new Map<string, ToolCallBlock>();

	for (const m of history) {
		if (m.role === "user") {
			messages.push({
				id: `hist-user-${messages.length}`,
				role: "user",
				text: extractText(m.content),
			});
		} else if (m.role === "assistant") {
			const blocks = messageToBlocks(m.content);
			for (const b of blocks) {
				if (b.type === "tool_call") toolCallIndex.set(b.toolCallId, b);
			}
			messages.push({
				id: `hist-asst-${messages.length}`,
				role: "assistant",
				text: extractText(m.content),
				blocks,
			});
		} else if (m.role === "toolResult" && m.toolCallId) {
			const block = toolCallIndex.get(String(m.toolCallId));
			if (block) {
				block.result = extractText(m.content);
				block.isError = m.isError === true;
				block.status = m.isError ? "error" : "success";
			}
		}
	}
	return messages;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Streaming state — module-level to survive React StrictMode double-invoke
// ═══════════════════════════════════════════════════════════════════════════════

export let currentUnsubscribe: (() => void) | null = null;
export function setCurrentUnsubscribe(fn: (() => void) | null): void {
	currentUnsubscribe = fn;
}

/**
 * ID of the current "draft" assistant message being streamed.
 * - Set when the first delta (text or thinking) of a turn arrives.
 * - Cleared when message.final finalizes the message.
 */
let draftId: string | null = null;

/** Monotonically increasing counter for unique message IDs. */
let idCounter = 0;
export function nextId(prefix: string): string {
	return `${prefix}-${++idCounter}-${Date.now()}`;
}

/** Timestamp (ms) when the current agent turn started. */
export let turnStartTime = 0;
export function setTurnStartTime(t: number): void {
	turnStartTime = t;
}

/** Per-session cache for turn stats (survives session switching). Key = sessionPath. */
export const turnStatsCache = new Map<string, { outputSpeed: number; durationSeconds: number }>();

/** Reset streaming state (when switching sessions). */
export function resetStreamState(): void {
	draftId = null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Immutable state update helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Ensure a draft assistant message exists for the current turn.
 * Returns [newMessages, draftIndex]. Creates a new draft if needed.
 */
export function ensureDraft(prev: ChatMessage[]): [ChatMessage[], number] {
	if (draftId) {
		// Find existing draft
		for (let i = prev.length - 1; i >= 0; i--) {
			if (prev[i].id === draftId) {
				return [[...prev], i];
			}
		}
		// Draft ID is stale — fall through to create new
	}

	// Create new draft
	const id = nextId("draft");
	draftId = id;
	const draft: ChatMessage = { id, role: "assistant", text: "", blocks: [] };
	const copy = [...prev, draft];
	return [copy, copy.length - 1];
}

/**
 * Append a text delta to a draft message's last text block (or create one).
 */
export function appendTextDelta(prev: ChatMessage[], delta: string): ChatMessage[] {
	const [msgs, idx] = ensureDraft(prev);
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

/**
 * Append a thinking delta to a draft message's last thinking block (or create one).
 */
export function appendThinkingDelta(prev: ChatMessage[], delta: string): ChatMessage[] {
	const [msgs, idx] = ensureDraft(prev);
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

/**
 * Finalize the current draft with the complete message content.
 *
 * Strategy:
 * - Text and thinking blocks come from the final message (authoritative).
 * - Tool call blocks that already exist on the draft (created by earlier
 *   tool.start events during THIS turn) are preserved.
 * - Any tool calls in the final message that DON'T have a matching block
 *   yet get created with status "pending" (execution hasn't happened).
 */
export function finalizeMessage(prev: ChatMessage[], content: unknown): ChatMessage[] {
	const copy = [...prev];
	const finalId = nextId("final");

	// Build text/thinking blocks from the final message
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

	// Find the draft (or last assistant message)
	let targetIdx = -1;
	if (draftId) {
		for (let i = copy.length - 1; i >= 0; i--) {
			if (copy[i].id === draftId) {
				targetIdx = i;
				break;
			}
		}
	}
	if (targetIdx === -1) {
		// No draft found — create a new message (don't overwrite history)
		const newMsg: ChatMessage = { id: finalId, role: "assistant", text: "", blocks: [] };
		copy.push(newMsg);
		targetIdx = copy.length - 1;
	}

	// Collect existing tool_call blocks from the target message
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

	// Merge or add tool calls from the final message
	for (const tc of finalToolCalls) {
		if (existingToolIds.has(tc.id)) {
			// Update args on existing block (may have been created by toolcall.start with empty args)
			const existing = existingToolBlocks.find((b) => b.toolCallId === tc.id);
			if (existing) {
				existing.args = tc.args;
			}
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

	// Assemble final blocks: text/thinking first, then tool calls
	const finalBlocks: ContentBlock[] = [...contentBlocks, ...existingToolBlocks];
	const text = extractText(content);

	if (targetIdx !== -1) {
		copy[targetIdx] = { ...copy[targetIdx], id: finalId, text, blocks: finalBlocks };
	} else {
		copy.push({ id: finalId, role: "assistant", text, blocks: finalBlocks });
	}

	// Clear draft — this turn's message is now finalized
	draftId = null;
	return copy;
}

/**
 * Handle tool.start: find or create a tool_call block on the last assistant message.
 */
export function handleToolStart(
	prev: ChatMessage[],
	toolCallId: string,
	toolName: string,
	args: Record<string, unknown>,
): ChatMessage[] {
	// First: search for a finalized message from the current turn (not a draft)
	// or the current draft. We only want to attach to the LAST assistant message
	// that belongs to the current turn, not older history messages.
	const lastMsg = prev.length > 0 ? prev[prev.length - 1] : null;

	// If the last message is an assistant message, attach to it
	if (lastMsg?.role === "assistant") {
		const blocks = [...(lastMsg.blocks ?? [])];

		// Check if this tool_call block already exists (from toolcall.start or message.final)
		const existing = blocks.findIndex((b) => b.type === "tool_call" && b.toolCallId === toolCallId);
		if (existing !== -1) {
			// Update args if the existing block has empty args (created by toolcall.start)
			const block = blocks[existing] as ToolCallBlock;
			if (Object.keys(block.args).length === 0 && Object.keys(args).length > 0) {
				blocks[existing] = { ...block, args };
				const copy = [...prev];
				copy[copy.length - 1] = { ...lastMsg, blocks };
				return copy;
			}
			return prev;
		}

		blocks.push({
			type: "tool_call",
			toolCallId,
			toolName,
			args,
			status: "pending",
		});

		const copy = [...prev];
		copy[copy.length - 1] = { ...lastMsg, blocks };
		return copy;
	}

	// No recent assistant message — create one
	const copy = [...prev];
	copy.push({
		id: nextId("tool-fallback"),
		role: "assistant",
		text: "",
		blocks: [
			{
				type: "tool_call",
				toolCallId,
				toolName,
				args,
				status: "pending",
			},
		],
	});
	return copy;
}

/**
 * Handle tool.end: find the matching tool_call block and update it with the result.
 */
export function handleToolEnd(
	prev: ChatMessage[],
	toolCallId: string,
	result: unknown,
	isError: boolean,
): ChatMessage[] {
	const resultText = extractResultText(result);

	// Search backwards for the matching tool_call block
	for (let i = prev.length - 1; i >= 0; i--) {
		const msg = prev[i];
		if (msg.role !== "assistant" || !msg.blocks) continue;

		const blockIdx = msg.blocks.findIndex((b) => b.type === "tool_call" && b.toolCallId === toolCallId);
		if (blockIdx === -1) continue;

		const copy = [...prev];
		const blocks = [...msg.blocks];
		const block = blocks[blockIdx] as ToolCallBlock;
		blocks[blockIdx] = {
			...block,
			status: isError ? "error" : "success",
			result: resultText,
			isError,
		};
		copy[i] = { ...msg, blocks };
		return copy;
	}

	return prev;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Ref-based variants (for components that manage their own draft state)
// ═══════════════════════════════════════════════════════════════════════════════

function ensureDraftWithRef(prev: ChatMessage[], draftIdRef: { current: string | null }): [ChatMessage[], number] {
	if (draftIdRef.current) {
		for (let i = prev.length - 1; i >= 0; i--) {
			if (prev[i].id === draftIdRef.current) {
				return [[...prev], i];
			}
		}
	}
	const id = nextId("draft");
	draftIdRef.current = id;
	const draft: ChatMessage = { id, role: "assistant", text: "", blocks: [] };
	const copy = [...prev, draft];
	return [copy, copy.length - 1];
}

export function clearDraftMessage(prev: ChatMessage[], draftIdRef: { current: string | null }): ChatMessage[] {
	const did = draftIdRef.current;
	if (!did) return prev;
	const idx = prev.findIndex((m) => m.id === did);
	if (idx === -1) return prev;
	const copy = [...prev];
	copy.splice(idx, 1);
	draftIdRef.current = null;
	return copy;
}

export function appendTextDeltaWithRef(
	prev: ChatMessage[],
	delta: string,
	draftIdRef: { current: string | null },
): ChatMessage[] {
	const [msgs, idx] = ensureDraftWithRef(prev, draftIdRef);
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

export function appendThinkingDeltaWithRef(
	prev: ChatMessage[],
	delta: string,
	draftIdRef: { current: string | null },
): ChatMessage[] {
	const [msgs, idx] = ensureDraftWithRef(prev, draftIdRef);
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
