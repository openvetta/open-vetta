import {
	type ExternalConversationEvent,
	nextGeneratedToolId,
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
	unwrapUserQuery,
} from "./jsonl.js";
import { projectJsonlListItem } from "./jsonl-list-item.js";
import { CLAUDE_CODE_TOOL_ID } from "./tool-ids.js";
import { collectFiles } from "./walk.js";

export const claudeCodeFormat: ExternalSessionFormat = {
	id: CLAUDE_CODE_TOOL_ID,
	ownsIdentity: looksLikeClaudeSession,
	canRead: looksLikeClaudeSession,
	collectIdentities: (root, host) =>
		collectFiles(host, root, {
			maxDepth: 1,
			include: (name, path) => isJsonlPath(path, host.basename) && !name.startsWith("."),
			matches: (path) => looksLikeClaudeSession(path, host),
		}),

	projectListItem: (path, host, cutoff) =>
		projectJsonlListItem(path, host, cutoff, CLAUDE_CODE_TOOL_ID, readClaudeListMeta),
	readHistory(path, host) {
		const parsed = parseJsonlRecords(host.readText(path));
		return projectExternalConversationDisplay({
			tool: CLAUDE_CODE_TOOL_ID,
			events: claudeRecordsToEvents(parsed.records),
			skippedLineCount: parsed.skippedLineCount,
		});
	},
	readBriefingSource(path, host) {
		if (!looksLikeClaudeSession(path, host)) return { error: "corrupted_header" };
		const parsed = parseJsonlRecords(host.readText(path));
		const meta = readClaudeListMeta(parsed.records, host.basename(path));
		return {
			tool: CLAUDE_CODE_TOOL_ID,
			cwd: meta.cwd,
			title: meta.title,
			supplement: meta.title,
			rounds: projectExternalBriefingRounds(claudeRecordsToEvents(parsed.records)),
			identityPath: path,
			bodyPath: path,
		};
	},
};

function looksLikeClaudeSession(path: string, host: ExternalSessionFileHost): boolean {
	if (!isJsonlPath(path, host.basename) || !host.exists(path)) return false;
	try {
		const parsed = parseJsonlRecords(host.readPrefixLines(path, EXTERNAL_HEADER_SCAN_LINES));
		return parsed.records.some(
			(record) =>
				readNonEmptyString(record.sessionId) !== undefined || readNonEmptyString(record.session_id) !== undefined,
		);
	} catch {
		return false;
	}
}

function readClaudeListMeta(records: readonly Record<string, unknown>[], fileName: string) {
	let sessionId = fileName.replace(/\.jsonl$/i, "");
	let cwd = "";
	let title = "";
	let lastActiveAt = 0;
	for (const record of records) {
		sessionId = readNonEmptyString(record.sessionId) ?? readNonEmptyString(record.session_id) ?? sessionId;
		cwd = readNonEmptyString(record.cwd) ?? cwd;
		const timestamp = readTimestamp(record.timestamp);
		if (timestamp !== undefined) lastActiveAt = timestamp;
		if (!title && record.type === "user") {
			const text = unwrapUserQuery(readClaudeUserText(record));
			if (text) title = text.slice(0, 120);
		}
	}
	return { id: sessionId, cwd, title, lastActiveAt };
}

function claudeRecordsToEvents(records: readonly Record<string, unknown>[]): ExternalConversationEvent[] {
	const events: ExternalConversationEvent[] = [];
	let toolIndex = 0;
	for (const record of records) {
		const type = readNonEmptyString(record.type);
		if (
			type === "system" ||
			type === "progress" ||
			type === "attachment" ||
			type === "file-history-snapshot" ||
			type === "mode" ||
			type === "permission-mode"
		) {
			continue;
		}
		if (type === "user") {
			const message = asRecord(record.message) ?? record;
			const content = message.content;
			if (Array.isArray(content)) {
				for (const part of content) {
					const block = asRecord(part);
					if (!block || block.type !== "tool_result") continue;
					events.push({
						kind: "tool_result",
						id: readNonEmptyString(block.tool_use_id) ?? nextGeneratedToolId(toolIndex),
						content: stringifyToolContent(block.content),
						isError: block.is_error === true,
					});
				}
			}
			const text = unwrapUserQuery(readClaudeUserText(record));
			if (text) events.push({ kind: "user", text });
			continue;
		}
		if (type !== "assistant") continue;
		const message = asRecord(record.message) ?? record;
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
			if (block.type === "tool_use") {
				toolIndex += 1;
				events.push({
					kind: "tool_call",
					id: readNonEmptyString(block.id) ?? nextGeneratedToolId(toolIndex),
					name: readNonEmptyString(block.name) ?? "tool",
					arguments: block.input,
				});
			}
		}
	}
	return events;
}

function readClaudeUserText(record: Record<string, unknown>): string {
	const message = asRecord(record.message) ?? record;
	const content = message.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.flatMap((part) => {
			const block = asRecord(part);
			if (!block || block.type === "tool_result") return [];
			return [readTextParts(block.type === "text" ? block.text : block)];
		})
		.join("")
		.trim();
}
