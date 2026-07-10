import type { Message, TextContent } from "@vetta/ai";
import type { SessionEntry as CodingSessionEntry, CustomEntry, FileEntry } from "@vetta/coding-agent";
import type { AssistantTurnTiming, HistoryEntry } from "../contracts.js";

export const ASSISTANT_TURN_TIMING_TYPE = "vetta.assistant_turn_timing";

/**
 * Reconstruct the leaf→root branch from a flat list of FileEntries (as
 * returned by loadEntriesFromFile). Mirrors what SessionManager.getBranch
 * does in-process but without instantiating SessionManager (which would
 * acquire the session-file lock).
 *
 * Strategy: find the most recent non-header entry that has no children,
 * then walk parentId back to the root. Order returned is root → leaf.
 */
export function branchFromFileEntries(entries: FileEntry[]): CodingSessionEntry[] {
	const byId = new Map<string, CodingSessionEntry>();
	const hasChild = new Set<string>();
	for (const e of entries) {
		if (e.type === "session") continue;
		const se = e as CodingSessionEntry;
		byId.set(se.id, se);
		if (se.parentId) hasChild.add(se.parentId);
	}
	let leafId: string | null = null;
	for (let i = entries.length - 1; i >= 0; i--) {
		const e = entries[i];
		if (e.type === "session") continue;
		const se = e as CodingSessionEntry;
		if (!hasChild.has(se.id)) {
			leafId = se.id;
			break;
		}
	}
	const branch: CodingSessionEntry[] = [];
	let cur = leafId ? byId.get(leafId) : undefined;
	while (cur) {
		branch.unshift(cur);
		cur = cur.parentId ? byId.get(cur.parentId) : undefined;
	}
	return branch;
}

export function parseAssistantTurnTiming(entry: CustomEntry): AssistantTurnTiming | null {
	const data = entry.data;
	if (!data || typeof data !== "object") return null;
	const candidate = data as Record<string, unknown>;
	const { startedAt, endedAt, durationMs } = candidate;
	if (
		typeof startedAt !== "number" ||
		typeof endedAt !== "number" ||
		typeof durationMs !== "number" ||
		!Number.isFinite(startedAt) ||
		!Number.isFinite(endedAt) ||
		!Number.isFinite(durationMs)
	) {
		return null;
	}
	return { startedAt, endedAt, durationMs };
}

/** Translate a session branch (coding-agent entries) into host HistoryEntry[]. */
export function entriesToHistory(branch: CodingSessionEntry[]): HistoryEntry[] {
	const entries: HistoryEntry[] = [];
	for (const entry of branch) {
		if (entry.type === "message") {
			const msg = entry.message;
			if (msg.role === "user" || msg.role === "assistant" || msg.role === "toolResult") {
				entries.push({ type: "message", message: msg as Message });
			}
		} else if (entry.type === "compaction") {
			entries.push({
				type: "compaction",
				summary: entry.summary,
				tokensBefore: entry.tokensBefore,
				timestamp: entry.timestamp,
			});
		} else if (entry.type === "custom" && entry.customType === ASSISTANT_TURN_TIMING_TYPE) {
			const timing = parseAssistantTurnTiming(entry);
			if (timing) {
				entries.push({
					type: "assistant_turn_timing",
					timing,
					timestamp: entry.timestamp,
				});
			}
		} else if (entry.type === "tool_timing") {
			entries.push({
				type: "tool_timing",
				toolCallId: entry.toolCallId,
				toolName: entry.toolName,
				startedAt: entry.startedAt,
				durationMs: entry.durationMs,
				phases: entry.phases,
				timestamp: entry.timestamp,
			});
		}
	}
	return entries;
}

export function extractAssistantText(content: Message["content"]): string {
	if (typeof content === "string") return content;
	return content
		.filter((item): item is TextContent => item.type === "text")
		.map((item) => item.text)
		.join("");
}
