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
import { CODEX_TOOL_ID } from "./tool-ids.js";
import { collectFiles } from "./walk.js";

export const codexFormat: ExternalSessionFormat = {
	id: CODEX_TOOL_ID,
	ownsIdentity: looksLikeCodexSession,
	canRead: looksLikeCodexSession,
	collectIdentities: (root, host) =>
		collectFiles(host, root, {
			maxDepth: 3,
			include: (name, path) => isJsonlPath(path, host.basename) && name.startsWith("rollout-"),
			matches: (path) => looksLikeCodexSession(path, host),
		}),

	projectListItem: (path, host, cutoff) => projectJsonlListItem(path, host, cutoff, CODEX_TOOL_ID, readCodexListMeta),
	readHistory(path, host) {
		const parsed = parseJsonlRecords(host.readText(path));
		return projectExternalConversationDisplay({
			tool: CODEX_TOOL_ID,
			events: codexRecordsToEvents(parsed.records),
			skippedLineCount: parsed.skippedLineCount,
		});
	},
	readBriefingSource(path, host) {
		if (!looksLikeCodexSession(path, host)) return { error: "corrupted_header" };
		const parsed = parseJsonlRecords(host.readText(path));
		const meta = readCodexListMeta(parsed.records, host.basename(path));
		return {
			tool: CODEX_TOOL_ID,
			cwd: meta.cwd,
			title: meta.title,
			supplement: meta.title,
			rounds: projectExternalBriefingRounds(codexRecordsToEvents(parsed.records)),
			identityPath: path,
			bodyPath: path,
		};
	},
};

function looksLikeCodexSession(path: string, host: ExternalSessionFileHost): boolean {
	if (!isJsonlPath(path, host.basename)) return false;
	try {
		const parsed = parseJsonlRecords(host.readPrefixLines(path, EXTERNAL_HEADER_SCAN_LINES));
		return parsed.records.some((record) => record.type === "session_meta");
	} catch {
		return false;
	}
}

function readCodexListMeta(records: readonly Record<string, unknown>[], fileName: string) {
	let id = fileName.replace(/\.jsonl$/i, "");
	let cwd = "";
	let title = "";
	let lastActiveAt = 0;
	for (const record of records) {
		const payload = asRecord(record.payload) ?? {};
		if (record.type === "session_meta") {
			id = readNonEmptyString(payload.id) ?? id;
			cwd = readNonEmptyString(payload.cwd) ?? cwd;
			lastActiveAt = readTimestamp(payload.timestamp) ?? readTimestamp(record.timestamp) ?? lastActiveAt;
		}
		if (!title && record.type === "response_item" && payload.type === "message" && payload.role === "user") {
			const text = readTextParts(payload.content).trim();
			if (text) title = text.slice(0, 120);
		}
	}
	return { id, cwd, title, lastActiveAt };
}

function codexRecordsToEvents(records: readonly Record<string, unknown>[]): ExternalConversationEvent[] {
	const events: ExternalConversationEvent[] = [];
	for (const record of records) {
		if (record.type !== "response_item") continue;
		const payload = asRecord(record.payload) ?? {};
		const payloadType = readNonEmptyString(payload.type);
		if (payloadType === "reasoning") {
			events.push({ kind: "reasoning" });
			continue;
		}
		if (payloadType === "message") {
			const role = readNonEmptyString(payload.role);
			const text = readTextParts(payload.content).trim();
			if (!text) continue;
			if (role === "user") events.push({ kind: "user", text });
			else if (role === "assistant") events.push({ kind: "assistant", text });
			continue;
		}
		if (payloadType === "function_call" || payloadType === "custom_tool_call") {
			const id = readNonEmptyString(payload.call_id) ?? readNonEmptyString(payload.id) ?? "codex-tool";
			const name = readNonEmptyString(payload.name) ?? "tool";
			events.push({
				kind: "tool_call",
				id,
				name,
				arguments: payload.arguments ?? payload.input,
			});
			continue;
		}
		if (payloadType === "function_call_output" || payloadType === "custom_tool_call_output") {
			const id = readNonEmptyString(payload.call_id) ?? readNonEmptyString(payload.id);
			if (!id) continue;
			events.push({
				kind: "tool_result",
				id,
				content: stringifyToolContent(payload.output ?? payload.content),
			});
		}
	}
	return events;
}
