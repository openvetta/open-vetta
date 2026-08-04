/**
 * LLM 上下文组装：从会话树当前 leaf 投影出发给模型的消息列表。
 *
 * 业务含义：
 * - 只沿 leaf→root 路径取 entries
 * - compaction 折叠为 summary + kept tail
 * - branch_summary / custom_message 转为对应 AgentMessage
 * - tool_timing / custom / label 等不进 prompt
 */

import type { AgentMessage } from "@vetta/agent-core";
import {
	createBranchSummaryMessage,
	createCompactionSummaryMessage,
	createCustomMessage,
} from "../../model-context/index.js";
import type { CompactionEntry, SessionContext, SessionEntry } from "./session-model.js";

export interface SessionContextProjectionItem {
	readonly message: AgentMessage;
	readonly entry: SessionEntry;
}

export interface SessionContextProjection {
	readonly items: readonly SessionContextProjectionItem[];
	readonly thinkingLevel: string;
	readonly model: { readonly provider: string; readonly modelId: string } | null;
}

export function getLatestCompactionEntry(entries: SessionEntry[]): CompactionEntry | null {
	for (let i = entries.length - 1; i >= 0; i--) {
		if (entries[i].type === "compaction") {
			return entries[i] as CompactionEntry;
		}
	}
	return null;
}

/**
 * Build the session context from entries using tree traversal.
 * If leafId is provided, walks from that entry to root.
 * Handles compaction and branch summaries along the path.
 */
export function buildSessionContext(
	entries: SessionEntry[],
	leafId?: string | null,
	byId?: Map<string, SessionEntry>,
): SessionContext {
	const projection = buildSessionContextProjection(entries, leafId, byId);
	return {
		messages: projection.items.map(({ message }) => message),
		thinkingLevel: projection.thinkingLevel,
		model: projection.model,
	};
}

export function buildSessionContextProjection(
	entries: SessionEntry[],
	leafId?: string | null,
	byId?: Map<string, SessionEntry>,
): SessionContextProjection {
	// Build uuid index if not available
	if (!byId) {
		byId = new Map<string, SessionEntry>();
		for (const entry of entries) {
			byId.set(entry.id, entry);
		}
	}

	// Find leaf
	let leaf: SessionEntry | undefined;
	if (leafId === null) {
		// Explicitly null - return no messages (navigated to before first entry)
		return { items: [], thinkingLevel: "off", model: null };
	}
	if (leafId) {
		leaf = byId.get(leafId);
	}
	if (!leaf) {
		// Fallback to last entry (when leafId is undefined)
		leaf = entries[entries.length - 1];
	}

	if (!leaf) {
		return { items: [], thinkingLevel: "off", model: null };
	}

	// Walk from leaf to root, collecting path
	const path: SessionEntry[] = [];
	let current: SessionEntry | undefined = leaf;
	while (current) {
		path.unshift(current);
		current = current.parentId ? byId.get(current.parentId) : undefined;
	}

	// Extract settings and find compaction
	let thinkingLevel = "off";
	let model: { provider: string; modelId: string } | null = null;
	let compaction: CompactionEntry | null = null;

	for (const entry of path) {
		if (entry.type === "thinking_level_change") {
			thinkingLevel = entry.thinkingLevel;
		} else if (entry.type === "model_change") {
			model = { provider: entry.provider, modelId: entry.modelId };
		} else if (entry.type === "message" && entry.message.role === "assistant") {
			model = { provider: entry.message.provider, modelId: entry.message.model };
		} else if (entry.type === "compaction") {
			compaction = entry;
		}
	}

	// Build messages and collect corresponding entries
	// When there's a compaction, we need to:
	// 1. Emit summary first (entry = compaction)
	// 2. Emit kept messages (from firstKeptEntryId up to compaction)
	// 3. Emit messages after compaction
	const items: SessionContextProjectionItem[] = [];

	const appendMessage = (entry: SessionEntry) => {
		if (entry.type === "message") {
			items.push({ message: entry.message, entry });
		} else if (entry.type === "custom_message") {
			items.push({
				message: createCustomMessage(
					entry.customType,
					entry.content,
					entry.display,
					entry.details,
					entry.timestamp,
				),
				entry,
			});
		} else if (entry.type === "branch_summary" && entry.summary) {
			items.push({ message: createBranchSummaryMessage(entry.summary, entry.fromId, entry.timestamp), entry });
		}
	};

	if (compaction) {
		// Emit summary first
		items.push({
			message: createCompactionSummaryMessage(compaction.summary, compaction.tokensBefore, compaction.timestamp),
			entry: compaction,
		});

		// Find compaction index in path
		const compactionIdx = path.findIndex((e) => e.type === "compaction" && e.id === compaction.id);

		// Emit kept messages (before compaction, starting from firstKeptEntryId)
		let foundFirstKept = false;
		for (let i = 0; i < compactionIdx; i++) {
			const entry = path[i];
			if (entry.id === compaction.firstKeptEntryId) {
				foundFirstKept = true;
			}
			if (foundFirstKept) {
				appendMessage(entry);
			}
		}

		// Emit messages after compaction
		for (let i = compactionIdx + 1; i < path.length; i++) {
			const entry = path[i];
			appendMessage(entry);
		}
	} else {
		// No compaction - emit all messages, handle branch summaries and custom messages
		for (const entry of path) {
			appendMessage(entry);
		}
	}

	return { items, thinkingLevel, model };
}
