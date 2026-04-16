import type { ChatMessage, ContentBlock, ToolCallBlock } from "@shared/store/atoms";
import type { HistoryEntry } from "../../../../../runtime-core/src/index.js";

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
		errorMessage?: string;
		stopReason?: string;
	}>,
): ChatMessage[] {
	const messages: ChatMessage[] = [];
	const toolCallIndex = new Map<string, ToolCallBlock>();

	/** Get or create the current assistant message to accumulate blocks into. */
	function currentAssistant(): ChatMessage {
		const last = messages.at(-1);
		if (last?.role === "assistant") return last;
		const msg: ChatMessage = {
			id: `hist-asst-${messages.length}`,
			role: "assistant",
			text: "",
			blocks: [],
		};
		messages.push(msg);
		return msg;
	}

	for (const m of history) {
		if (m.role === "user") {
			messages.push({
				id: `hist-user-${messages.length}`,
				role: "user",
				text: extractText(m.content),
			});
		} else if (m.role === "assistant") {
			// Merge consecutive assistant messages into one (same agent turn)
			const target = currentAssistant();
			const blocks = messageToBlocks(m.content);
			for (const b of blocks) {
				if (b.type === "tool_call") toolCallIndex.set(b.toolCallId, b);
			}
			target.blocks!.push(...blocks);
			// Accumulate text
			const text = extractText(m.content);
			if (text) target.text = target.text ? `${target.text}\n${text}` : text;
			// Handle error messages (e.g. provider 404)
			if (m.stopReason === "error" && m.errorMessage) {
				target.blocks!.push({ type: "error", text: m.errorMessage });
				if (!target.text) target.text = m.errorMessage;
			}
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

/**
 * Convert full history entries (including compaction boundaries) into ChatMessages.
 * Unlike historyToChat, this preserves the complete conversation across compactions.
 */
export function fullHistoryToChat(entries: HistoryEntry[]): ChatMessage[] {
	const messages: ChatMessage[] = [];
	const toolCallIndex = new Map<string, ToolCallBlock>();

	function currentAssistant(): ChatMessage {
		const last = messages.at(-1);
		if (last?.role === "assistant") return last;
		const msg: ChatMessage = {
			id: `hist-asst-${messages.length}`,
			role: "assistant",
			text: "",
			blocks: [],
		};
		messages.push(msg);
		return msg;
	}

	for (const entry of entries) {
		if (entry.type === "compaction") {
			messages.push({
				id: `hist-compact-${messages.length}`,
				role: "compaction",
				text: entry.summary,
				timestamp: new Date(entry.timestamp).getTime(),
			});
			continue;
		}

		const m = entry.message as {
			role: string;
			content: unknown;
			toolCallId?: string;
			toolName?: string;
			isError?: boolean;
			errorMessage?: string;
			stopReason?: string;
		};

		if (m.role === "user") {
			messages.push({
				id: `hist-user-${messages.length}`,
				role: "user",
				text: extractText(m.content),
			});
		} else if (m.role === "assistant") {
			const target = currentAssistant();
			const blocks = messageToBlocks(m.content);
			for (const b of blocks) {
				if (b.type === "tool_call") toolCallIndex.set(b.toolCallId, b);
			}
			target.blocks!.push(...blocks);
			const text = extractText(m.content);
			if (text) target.text = target.text ? `${target.text}\n${text}` : text;
			if (m.stopReason === "error" && m.errorMessage) {
				target.blocks!.push({ type: "error", text: m.errorMessage });
				if (!target.text) target.text = m.errorMessage;
			}
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

/** Adopt an existing history message as the current draft (for session restore while streaming). */
export function adoptDraftId(id: string): void {
	draftId = id;
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
	const draft: ChatMessage = { id, role: "assistant", text: "", blocks: [], timestamp: Date.now() };
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
 * An agent turn can produce multiple message.final events (one per LLM call
 * in the agent loop). All content accumulates into a single assistant message.
 *
 * Strategy:
 * - Keep ALL existing blocks on the message (from previous LLM calls in this turn).
 * - The current LLM call's content was already streamed via deltas, so the
 *   blocks are already present. We use the final message to ensure tool_call
 *   blocks exist with correct args.
 * - draftId is NOT cleared here — it persists until resetStreamState() at agent_end.
 */
export function finalizeMessage(prev: ChatMessage[], content: unknown): ChatMessage[] {
	const copy = [...prev];

	// Parse tool calls from the final message
	const finalToolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
	if (Array.isArray(content)) {
		for (const part of content as Array<Record<string, unknown>>) {
			if (part.type === "toolCall" && typeof part.name === "string") {
				finalToolCalls.push({
					id: String(part.id ?? ""),
					name: String(part.name),
					args: (part.arguments as Record<string, unknown>) ?? {},
				});
			}
		}
	}

	// Find the target message (draft or last assistant)
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
		// No draft — find last assistant message or create one
		for (let i = copy.length - 1; i >= 0; i--) {
			if (copy[i].role === "assistant") {
				targetIdx = i;
				break;
			}
		}
		if (targetIdx === -1) {
			const id = nextId("final");
			draftId = id;
			copy.push({ id, role: "assistant", text: "", blocks: [], timestamp: Date.now() });
			targetIdx = copy.length - 1;
		}
	}

	const msg = copy[targetIdx];
	const blocks = [...(msg.blocks ?? [])];

	// Collect existing tool_call IDs
	const existingToolIds = new Set<string>();
	for (const b of blocks) {
		if (b.type === "tool_call") existingToolIds.add(b.toolCallId);
	}

	// Merge tool calls: update existing or add new
	for (const tc of finalToolCalls) {
		if (existingToolIds.has(tc.id)) {
			const idx = blocks.findIndex((b) => b.type === "tool_call" && b.toolCallId === tc.id);
			if (idx !== -1) {
				const existing = blocks[idx] as ToolCallBlock;
				if (Object.keys(existing.args).length === 0 && Object.keys(tc.args).length > 0) {
					blocks[idx] = { ...existing, args: tc.args };
				}
			}
		} else {
			blocks.push({
				type: "tool_call",
				toolCallId: tc.id,
				toolName: tc.name,
				args: tc.args,
				status: "pending",
			});
		}
	}

	// Update text from all text blocks
	const text = blocks
		.filter((b) => b.type === "text")
		.map((b) => (b as { text: string }).text)
		.join("");

	copy[targetIdx] = { ...msg, text, blocks };

	// Do NOT clear draftId — the agent turn may continue with more LLM calls.
	// draftId is cleared by resetStreamState() at agent_start/agent_end.
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

	// No recent assistant message — use ensureDraft to keep one turn = one message
	const [msgs, idx] = ensureDraft(prev);
	const msg = msgs[idx];
	const blocks = [...(msg.blocks ?? [])];
	blocks.push({
		type: "tool_call",
		toolCallId,
		toolName,
		args,
		status: "pending",
	});
	msgs[idx] = { ...msg, blocks };
	return msgs;
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

/**
 * Append an error block to the current draft assistant message.
 */
export function appendError(prev: ChatMessage[], errorMessage: string): ChatMessage[] {
	const [msgs, idx] = ensureDraft(prev);
	const msg = msgs[idx];
	const blocks = [...(msg.blocks ?? [])];
	blocks.push({ type: "error", text: errorMessage });
	msgs[idx] = { ...msg, text: msg.text || errorMessage, blocks };
	return msgs;
}

// ═══════════════════════════════════════════════════════════════════════════════
// File extraction helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract modified/created file paths from chat messages in the current turn.
 * Scans tool_call blocks for "write" and "edit" tool invocations.
 */
export function extractModifiedFiles(messages: ChatMessage[]): string[] {
	const modified = new Set<string>();
	for (const msg of messages) {
		if (msg.role !== "assistant" || !msg.blocks) continue;
		for (const block of msg.blocks) {
			if (block.type !== "tool_call") continue;
			if (block.toolName !== "write" && block.toolName !== "edit") continue;
			const path = block.args?.path;
			if (typeof path === "string") modified.add(path);
		}
	}
	return [...modified].sort();
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
	const draft: ChatMessage = { id, role: "assistant", text: "", blocks: [], timestamp: Date.now() };
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
