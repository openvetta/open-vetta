import {
	type ExternalConversationEvent,
	projectExternalBriefingRounds,
	projectExternalConversationDisplay,
} from "./display.js";
import type { ExternalSessionFormat } from "./format.js";
import type { ExternalSessionFileHost } from "./host-contracts.js";
import {
	asRecord,
	EXTERNAL_HEADER_SCAN_LINES,
	isJsonlPath,
	parseJsonlRecords,
	readNonEmptyString,
	readTextParts,
	readTimestamp,
	stringifyToolContent,
} from "./jsonl.js";
import { projectJsonlListItem } from "./jsonl-list-item.js";
import { type ExternalSessionToolId, OMP_TOOL_ID, PI_TOOL_ID } from "./tool-ids.js";
import { collectFiles } from "./walk.js";

export const piFormat = createCodingAgentJsonlFormat({
	id: PI_TOOL_ID,
	maxDepth: 1,
	enter: (name) => name !== "subagent-artifacts",
	isMatch: looksLikePiSession,
});

export const ompFormat = createCodingAgentJsonlFormat({
	id: OMP_TOOL_ID,
	maxDepth: 2,
	enter: (name) => name !== "subagent-artifacts",
	isMatch: looksLikeOmpSession,
});

function createCodingAgentJsonlFormat(input: {
	readonly id: ExternalSessionToolId;
	readonly maxDepth: number;
	readonly enter: (name: string) => boolean;
	readonly isMatch: (path: string, host: ExternalSessionFileHost) => boolean;
}): ExternalSessionFormat {
	return {
		id: input.id,
		ownsIdentity: input.isMatch,
		canRead: input.isMatch,
		collectIdentities: (root, host) =>
			collectFiles(host, root, {
				maxDepth: input.maxDepth,
				enter: input.enter,
				include: (_name, path) => isJsonlPath(path, host.basename),
				matches: (path) => input.isMatch(path, host),
			}),

		projectListItem: (path, host, cutoff) =>
			projectJsonlListItem(path, host, cutoff, input.id, readCodingAgentListMeta),
		readHistory(path, host) {
			const parsed = parseJsonlRecords(host.readText(path));
			return projectExternalConversationDisplay({
				tool: input.id,
				events: codingAgentRecordsToEvents(parsed.records),
				skippedLineCount: parsed.skippedLineCount,
			});
		},
		readBriefingSource(path, host) {
			if (!input.isMatch(path, host)) return { error: "corrupted_header" };
			const parsed = parseJsonlRecords(host.readText(path));
			const meta = readCodingAgentListMeta(parsed.records, host.basename(path));
			return {
				tool: input.id,
				cwd: meta.cwd,
				title: meta.title,
				supplement: meta.title,
				rounds: projectExternalBriefingRounds(codingAgentRecordsToEvents(parsed.records)),
				identityPath: path,
				bodyPath: path,
			};
		},
	};
}

function looksLikePiSession(path: string, host: ExternalSessionFileHost): boolean {
	if (!isJsonlPath(path, host.basename) || !host.exists(path)) return false;
	try {
		const parsed = parseJsonlRecords(host.readPrefixLines(path, EXTERNAL_HEADER_SCAN_LINES));
		if (parsed.records.some((record) => record.type === "title")) return false;
		return parsed.records.some((record) => record.type === "session" && record.version !== undefined);
	} catch {
		return false;
	}
}

function looksLikeOmpSession(path: string, host: ExternalSessionFileHost): boolean {
	if (!isJsonlPath(path, host.basename) || !host.exists(path)) return false;
	try {
		const parsed = parseJsonlRecords(host.readPrefixLines(path, EXTERNAL_HEADER_SCAN_LINES));
		if (parsed.records.some((record) => record.type === "title")) return true;
		return parsed.records.some(
			(record) => record.type === "session" && readNonEmptyString(record.title) !== undefined,
		);
	} catch {
		return false;
	}
}
function readCodingAgentListMeta(records: readonly Record<string, unknown>[], fileName: string) {
	let id = fileName.replace(/\.jsonl$/i, "");
	let cwd = "";
	let title = "";
	let lastActiveAt = 0;
	for (const record of records) {
		if (record.type === "title") {
			title = readNonEmptyString(record.title) ?? title;
			lastActiveAt = readTimestamp(record.updatedAt) ?? lastActiveAt;
		}
		if (record.type === "session") {
			id = readNonEmptyString(record.id) ?? id;
			cwd = readNonEmptyString(record.cwd) ?? cwd;
			title = readNonEmptyString(record.title) ?? title;
			lastActiveAt = readTimestamp(record.timestamp) ?? lastActiveAt;
		}
		if (record.type === "title_change") {
			title = readNonEmptyString(record.title) ?? title;
		}
		if (!title && record.type === "message") {
			const message = asRecord(record.message) ?? {};
			if (message.role === "user") {
				const text = readTextParts(message.content).trim();
				if (text) title = text.slice(0, 120);
			}
		}
	}
	return { id, cwd, title, lastActiveAt };
}

function codingAgentRecordsToEvents(records: readonly Record<string, unknown>[]): ExternalConversationEvent[] {
	const events: ExternalConversationEvent[] = [];
	for (const record of records) {
		if (record.type !== "message") continue;
		const message = asRecord(record.message) ?? record;
		const role = readNonEmptyString(message.role);
		if (role === "user") {
			const text = readTextParts(message.content).trim();
			if (text) events.push({ kind: "user", text });
			continue;
		}
		if (role === "toolResult") {
			const id = readNonEmptyString(message.toolCallId);
			if (!id) continue;
			events.push({
				kind: "tool_result",
				id,
				name: readNonEmptyString(message.toolName),
				content: stringifyToolContent(message.content),
				isError: message.isError === true,
			});
			continue;
		}
		if (role !== "assistant") continue;
		const content = message.content;
		if (typeof content === "string" && content.trim()) {
			events.push({ kind: "assistant", text: content.trim() });
			continue;
		}
		if (!Array.isArray(content)) continue;
		for (const part of content) {
			const block = asRecord(part);
			if (!block) continue;
			if (block.type === "thinking") {
				events.push({ kind: "reasoning" });
				continue;
			}
			if (block.type === "text") {
				const text = readNonEmptyString(block.text);
				if (text) events.push({ kind: "assistant", text });
				continue;
			}
			if (block.type === "toolCall") {
				const id = readNonEmptyString(block.id);
				const name = readNonEmptyString(block.name);
				if (!id || !name) continue;
				events.push({ kind: "tool_call", id, name, arguments: block.arguments });
			}
		}
	}
	return events;
}
