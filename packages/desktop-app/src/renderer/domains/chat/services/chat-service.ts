import { pathBasename, pathJoin, pathNormalize } from "@shared/lib/utils";
import type {
	ChatMessage,
	ContentBlock,
	ToolCallBlock,
	ToolCallUiDetails,
	ToolImagePreview,
} from "@shared/store/atoms";
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

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asFiniteNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function base64SizeBytes(data: string): number {
	const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
	return Math.max(0, Math.floor((data.length * 3) / 4) - padding);
}

export function extractToolImagePreview(result: unknown, details: unknown): ToolImagePreview | undefined {
	const resultRecord = asRecord(result);
	const content = Array.isArray(resultRecord?.content) ? resultRecord.content : Array.isArray(result) ? result : [];
	const image = content.find((part): part is { type: "image"; data: string; mimeType: string } => {
		const record = asRecord(part);
		return record?.type === "image" && typeof record.data === "string" && typeof record.mimeType === "string";
	});
	if (!image) return undefined;

	const detailsRecord = asRecord(details) ?? asRecord(resultRecord?.details);
	const imageDetails = asRecord(detailsRecord?.image);

	return {
		data: image.data,
		mimeType: image.mimeType,
		originalPath: typeof imageDetails?.originalPath === "string" ? imageDetails.originalPath : undefined,
		originalMimeType: typeof imageDetails?.originalMimeType === "string" ? imageDetails.originalMimeType : undefined,
		originalSizeBytes: asFiniteNumber(imageDetails?.originalSizeBytes),
		originalWidth: asFiniteNumber(imageDetails?.originalWidth),
		originalHeight: asFiniteNumber(imageDetails?.originalHeight),
		processedSizeBytes: asFiniteNumber(imageDetails?.processedSizeBytes) ?? base64SizeBytes(image.data),
		processedWidth: asFiniteNumber(imageDetails?.processedWidth),
		processedHeight: asFiniteNumber(imageDetails?.processedHeight),
		wasResized: typeof imageDetails?.wasResized === "boolean" ? imageDetails.wasResized : undefined,
	};
}

export function extractToolUiDetails(result: unknown, details: unknown): ToolCallUiDetails | undefined {
	const resultRecord = asRecord(result);
	const detailsRecord = asRecord(details) ?? asRecord(resultRecord?.details);
	if (!detailsRecord) return undefined;

	const diff = typeof detailsRecord.diff === "string" ? detailsRecord.diff : undefined;
	const firstChangedLine = asFiniteNumber(detailsRecord.firstChangedLine);
	if (diff === undefined && firstChangedLine === undefined) return undefined;

	return {
		...(diff !== undefined ? { diff } : {}),
		...(firstChangedLine !== undefined ? { firstChangedLine } : {}),
	};
}

/**
 * Convert a stored assistant message's content array into ContentBlock[].
 * Used for history loading only — tool_call blocks get status "success"
 * because history messages are already complete.
 */
export function messageToBlocks(content: unknown): ContentBlock[] {
	if (typeof content === "string") {
		return content ? [{ type: "text", id: nextId("blk"), text: content }] : [];
	}
	if (!Array.isArray(content)) return [];
	const blocks: ContentBlock[] = [];
	for (const part of content as Array<Record<string, unknown>>) {
		if (part.type === "text" && typeof part.text === "string") {
			blocks.push({ type: "text", id: nextId("blk"), text: part.text });
		} else if (part.type === "thinking" && typeof part.thinking === "string") {
			blocks.push({ type: "thinking", id: nextId("blk"), text: part.thinking });
		} else if (part.type === "toolCall" && typeof part.name === "string" && part.name !== "") {
			// Skip empty-name toolCall parts left behind by old provider parser bugs
			// (OpenAI-compat placeholder frames produced ghost {id:"", name:""} blocks
			// in some sessions). Showing them as unnamed tool blocks is meaningless
			// and confuses users.
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
		details?: unknown;
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
				target.blocks!.push({ type: "error", id: nextId("blk"), text: m.errorMessage });
				if (!target.text) target.text = m.errorMessage;
			}
		} else if (m.role === "toolResult" && m.toolCallId) {
			const block = toolCallIndex.get(String(m.toolCallId));
			if (block) {
				block.result = extractText(m.content);
				block.imagePreview = extractToolImagePreview(m.content, m.details);
				block.uiDetails = extractToolUiDetails(m.content, m.details);
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

		if (entry.type === "assistant_turn_timing") {
			for (let i = messages.length - 1; i >= 0; i--) {
				const message = messages[i];
				if (message.role === "assistant") {
					const { startedAt, endedAt, durationMs } = entry.timing;
					messages[i] = {
						...message,
						startedAt,
						endedAt,
						durationSeconds: durationMs / 1000,
					};
					break;
				}
			}
			continue;
		}

		if (entry.type === "tool_timing") {
			// Attach out-of-band timing to its matching tool_call block. UI-only;
			// never round-trips into LLM context (see ADR 0001).
			const block = toolCallIndex.get(entry.toolCallId);
			if (block) {
				block.startedAt = entry.startedAt;
				block.durationMs = entry.durationMs;
				block.phases = entry.phases.map((p) => ({ label: p.label, atMs: p.atMs }));
			}
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
			details?: unknown;
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
				target.blocks!.push({ type: "error", id: nextId("blk"), text: m.errorMessage });
				if (!target.text) target.text = m.errorMessage;
			}
		} else if (m.role === "toolResult" && m.toolCallId) {
			const block = toolCallIndex.get(String(m.toolCallId));
			if (block) {
				block.result = extractText(m.content);
				block.imagePreview = extractToolImagePreview(m.content, m.details);
				block.uiDetails = extractToolUiDetails(m.content, m.details);
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

// 调用令牌：openSession 是一段串行 await，期间用户可能再次切换 session，
// 第二个 openSession 会在第一个尚未把 unsub 写入 currentUnsubscribe 时就完成
// 自己的 teardown（teardown 时 currentUnsubscribe 还是 null，什么都拆不掉），
// 然后两个 subscribe 都成功 → 后者覆盖前者，前者的 IPC 监听器永远泄漏。
// 每次进入 openSession 调用 bumpOpenSessionToken() 拿到自己的 token，在 await
// 完 subscribe() 后再校验一次 token，发现被超越就立刻 unsub 自己创建的订阅。
let openSessionToken = 0;
export function bumpOpenSessionToken(): number {
	return ++openSessionToken;
}
export function getOpenSessionToken(): number {
	return openSessionToken;
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
	const draftTimestamp = turnStartTime || Date.now();
	const draft: ChatMessage = {
		id,
		role: "assistant",
		text: "",
		blocks: [],
		timestamp: draftTimestamp,
		startedAt: draftTimestamp,
	};
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
		blocks.push({ type: "text", id: nextId("blk"), text: delta });
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
		blocks.push({ type: "thinking", id: nextId("blk"), text: delta });
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
			const draftTimestamp = turnStartTime || Date.now();
			copy.push({
				id,
				role: "assistant",
				text: "",
				blocks: [],
				timestamp: draftTimestamp,
				startedAt: draftTimestamp,
			});
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
	startedAt?: number,
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
			const block = blocks[existing] as ToolCallBlock;
			const argsChanged = Object.keys(block.args).length === 0 && Object.keys(args).length > 0;
			const startedAtChanged = startedAt !== undefined && block.startedAt === undefined;
			if (argsChanged || startedAtChanged) {
				blocks[existing] = {
					...block,
					args: argsChanged ? args : block.args,
					startedAt: startedAtChanged ? startedAt : block.startedAt,
				};
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
			startedAt,
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
		startedAt,
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
	timing?: { startedAt: number; durationMs: number; phases: Array<{ label: string; atMs: number }> },
): ChatMessage[] {
	const resultText = extractResultText(result);
	const imagePreview = extractToolImagePreview(result, undefined);
	const uiDetails = extractToolUiDetails(result, undefined);

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
			imagePreview,
			uiDetails,
			isError,
			startedAt: timing?.startedAt ?? block.startedAt,
			durationMs: timing?.durationMs ?? block.durationMs,
			phases: timing?.phases ?? block.phases,
			// Clear currentPhase — execution is over, the badge is no longer "live".
			currentPhase: undefined,
		};
		copy[i] = { ...msg, blocks };
		return copy;
	}

	return prev;
}

/**
 * Handle tool.phase: append a phase boundary to the matching tool_call block
 * while it's still streaming, and mark it as the live "currentPhase" for header
 * display. Both are out-of-band metadata — never sent to the LLM.
 */
export function handleToolPhase(prev: ChatMessage[], toolCallId: string, label: string, atMs: number): ChatMessage[] {
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
			phases: [...(block.phases ?? []), { label, atMs }],
			currentPhase: label,
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
	blocks.push({ type: "error", id: nextId("blk"), text: errorMessage });
	msgs[idx] = { ...msg, text: msg.text || errorMessage, blocks };
	return msgs;
}

// ═══════════════════════════════════════════════════════════════════════════════
// File extraction helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract modified/created file paths from chat messages in the current turn.
 *
 * Static (from args):
 *   - write / edit                            → args.path
 *   - html_to_pdf                             → args.output
 *   - doc_to_pdf                              → args.output  (default: replaceExt(args.path, ".pdf"))
 *   - extract_text_from_pdf|img               → args.output  (default: <args.input>.ocr.json)
 *
 * Dynamic (heuristic):
 *   - bash / shell                            → parse args.command for redirections (`>`, `>>`, `tee`)
 *   - any tool's result text (incl. invoke_skill, bash, shell) is scanned for
 *     output markers like "Output:", "Saved to:", "Wrote:", "Created:", "Written to:".
 *
 * After collection, paths whose extension is in HIDDEN_EXTENSIONS are filtered
 * out — those file types are noise for non-developer users.
 */
const HIDDEN_EXTENSIONS = new Set([".js", ".py", ".json"]);
const NOISE_EXTENSIONS = new Set([".log", ".tmp"]);
const NOISE_BASENAMES = new Set([".DS_Store", "Thumbs.db"]);
const EXTENSIONLESS_ALLOWLIST = new Set([
	"Makefile",
	"Dockerfile",
	"Rakefile",
	"Gemfile",
	"Procfile",
	"LICENSE",
	"README",
	"CHANGELOG",
	"AUTHORS",
	"NOTICE",
]);

function getExt(p: string): string {
	const slash = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
	const dot = p.lastIndexOf(".");
	if (dot > slash) return p.slice(dot).toLowerCase();
	return "";
}

function isAbsolutePath(p: string): boolean {
	return p.startsWith("/") || p.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(p);
}

function hasHiddenSegment(relPath: string): boolean {
	for (const seg of relPath.split("/")) {
		if (seg.startsWith(".") && seg !== "." && seg !== "..") return true;
	}
	return false;
}

function replaceExt(p: string, newExt: string): string {
	const slash = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
	const dot = p.lastIndexOf(".");
	if (dot > slash) return p.slice(0, dot) + newExt;
	return p + newExt;
}

function asStr(v: unknown): string | undefined {
	return typeof v === "string" && v ? v : undefined;
}

/**
 * Strip heredoc bodies from a shell command so their contents are not scanned
 * for redirections — `cat > out.html <<HTMLEOF\n<body>...\nHTMLEOF` would
 * otherwise leak `body` / `HTMLEOF` into the artifact list as false positives.
 */
function stripHeredocs(cmd: string): string {
	const lines = cmd.split("\n");
	const out: string[] = [];
	let terminator: string | null = null;
	const re = /<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/;
	for (const line of lines) {
		if (terminator !== null) {
			if (line.trim() === terminator) terminator = null;
			continue;
		}
		const m = line.match(re);
		if (m) terminator = m[1];
		out.push(line);
	}
	return out.join("\n");
}

/** Extract output paths from a shell command via redirection / tee patterns. */
function extractPathsFromShellCommand(cmd: string): string[] {
	const paths = new Set<string>();
	const cleaned = stripHeredocs(cmd);
	// `> path`, `>> path`, `| tee [-a|-i] path` — path may be quoted
	const re = /(?:>>?|\|\s*tee(?:\s+-[aAi]+)?)\s+(?:"([^"]+)"|'([^']+)'|([^\s|;&<>()`]+))/g;
	for (const m of cleaned.matchAll(re)) {
		const p = m[1] ?? m[2] ?? m[3];
		if (p && p !== "/dev/null" && !p.startsWith("&")) paths.add(p);
	}
	return [...paths];
}

/** Scan free-form result text for explicit "wrote/output/saved to" path markers. */
function extractPathsFromResultText(text: string): string[] {
	const paths = new Set<string>();
	const re =
		/(?:Output|Saved\s+to|Wrote|Written\s+to|Created(?:\s+file)?|Generated)\s*:?\s+("([^"]+)"|'([^']+)'|(\S+))/gi;
	for (const m of text.matchAll(re)) {
		const raw = m[2] ?? m[3] ?? m[4];
		if (!raw) continue;
		const p = raw.replace(/[.,;)\]]+$/, "");
		if (p && /[/.\\]/.test(p)) paths.add(p);
	}
	return [...paths];
}

function extractToolOutputs(block: ToolCallBlock): string[] {
	const args = block.args ?? {};
	const out: string[] = [];
	switch (block.toolName) {
		case "write":
		case "edit": {
			const p = asStr(args.path);
			if (p) out.push(p);
			break;
		}
		case "html_to_pdf": {
			const p = asStr(args.output);
			if (p) out.push(p);
			break;
		}
		case "doc_to_pdf": {
			const p = asStr(args.output) ?? (asStr(args.path) ? replaceExt(asStr(args.path)!, ".pdf") : undefined);
			if (p) out.push(p);
			break;
		}
		case "extract_text_from_pdf":
		case "extract_text_from_img": {
			const p = asStr(args.output) ?? (asStr(args.input) ? `${asStr(args.input)!}.ocr.json` : undefined);
			if (p) out.push(p);
			break;
		}
		case "render_pdf_page": {
			const input = asStr(args.input);
			const page = typeof args.page === "number" ? args.page : undefined;
			const p = asStr(args.output) ?? (input && page !== undefined ? `${input}.p${page}.png` : undefined);
			if (p) out.push(p);
			break;
		}
		case "bash":
		case "shell": {
			const cmd = asStr(args.command);
			if (cmd) out.push(...extractPathsFromShellCommand(cmd));
			break;
		}
	}
	// Generic fallback: scan result text for explicit output markers (covers
	// invoke_skill and any tool that prints "Output: …" / "Saved to: …" etc.)
	if (block.result && !block.isError) {
		out.push(...extractPathsFromResultText(block.result));
	}
	return out;
}

/**
 * 仅保留「本轮」消息：从最后一条 user 消息（含）开始的尾部切片。
 * 用于产物列表——本轮没动文件就该是空，不能把历史轮的文件捞回来。
 * 没有 user 消息时回退到整段（兼容仅 assistant / 空对话场景）。
 */
function sliceCurrentTurn(messages: ChatMessage[]): ChatMessage[] {
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === "user") return messages.slice(i);
	}
	return messages;
}

/**
 * Collect tool-produced file paths and filter out noise so the UI artifact list
 * stays focused on real, project-local outputs:
 *   1. drop files whose extension is in HIDDEN_EXTENSIONS / NOISE_EXTENSIONS,
 *      or whose basename is in NOISE_BASENAMES (.DS_Store etc.);
 *   2. drop anything that resolves outside `cwd` (skipped when cwd is absent);
 *   3. drop paths with any "."-prefixed segment (.git/, src/.cache/x, root .env).
 * Dedupe by normalized absolute path; display the project-relative form when
 * available so the list reads naturally.
 *
 * 默认只扫「本轮」（最后一条 user 消息之后），保持「产物列表 = 本轮产出」语义。
 */
export function extractModifiedFiles(messages: ChatMessage[], cwd?: string): string[] {
	messages = sliceCurrentTurn(messages);
	const normalizedCwd = cwd ? pathNormalize(cwd) : "";
	const seen = new Set<string>();
	const out: Array<{ abs: string; display: string }> = [];
	for (const msg of messages) {
		if (msg.role !== "assistant" || !msg.blocks) continue;
		for (const block of msg.blocks) {
			if (block.type !== "tool_call") continue;
			for (const raw of extractToolOutputs(block)) {
				const base = pathBasename(raw);
				if (NOISE_BASENAMES.has(base)) continue;
				const ext = getExt(raw);
				if (HIDDEN_EXTENSIONS.has(ext) || NOISE_EXTENSIONS.has(ext)) continue;
				// Drop extensionless tokens — almost always heredoc terminators
				// or bash barewords (`body`, `HTMLEOF`). Keep well-known files.
				if (!ext && !EXTENSIONLESS_ALLOWLIST.has(base)) continue;

				const joined = isAbsolutePath(raw) || !normalizedCwd ? raw : pathJoin(normalizedCwd, raw);
				const abs = pathNormalize(joined);

				let rel: string | null = null;
				if (normalizedCwd) {
					if (abs === normalizedCwd) continue;
					if (abs.startsWith(`${normalizedCwd}/`)) {
						rel = abs.slice(normalizedCwd.length + 1);
					} else {
						continue;
					}
				}
				const segCheck = rel ?? abs;
				if (hasHiddenSegment(segCheck)) continue;

				if (seen.has(abs)) continue;
				seen.add(abs);
				out.push({ abs, display: rel ?? raw });
			}
		}
	}
	return out.map((e) => e.display).sort();
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
	const draftTimestamp = turnStartTime || Date.now();
	const draft: ChatMessage = {
		id,
		role: "assistant",
		text: "",
		blocks: [],
		timestamp: draftTimestamp,
		startedAt: draftTimestamp,
	};
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
		blocks.push({ type: "text", id: nextId("blk"), text: delta });
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
		blocks.push({ type: "thinking", id: nextId("blk"), text: delta });
	}
	msgs[idx] = { ...msg, blocks };
	return msgs;
}
