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
	unwrapUserQuery,
} from "./jsonl.js";
import { projectJsonlListItem } from "./jsonl-list-item.js";
import { CURSOR_AGENT_TOOL_ID } from "./tool-ids.js";
import { collectFiles } from "./walk.js";

export const cursorAgentFormat: ExternalSessionFormat = {
	id: CURSOR_AGENT_TOOL_ID,
	ownsIdentity: looksLikeCursorAgentSession,
	canRead: looksLikeCursorAgentSession,
	collectIdentities: collectCursorTranscripts,
	projectListItem: (path, host, cutoff) =>
		projectJsonlListItem(path, host, cutoff, CURSOR_AGENT_TOOL_ID, (records, fileName) =>
			readCursorListMeta(records, fileName, path, host),
		),

	readHistory(path, host) {
		const parsed = parseJsonlRecords(host.readText(path));
		return projectExternalConversationDisplay({
			tool: CURSOR_AGENT_TOOL_ID,
			events: cursorRecordsToEvents(parsed.records),
			skippedLineCount: parsed.skippedLineCount,
		});
	},
	readBriefingSource(path, host) {
		if (!looksLikeCursorAgentSession(path, host)) return { error: "corrupted_header" };
		const parsed = parseJsonlRecords(host.readText(path));
		const meta = readCursorListMeta(parsed.records, host.basename(path), path, host);

		return {
			tool: CURSOR_AGENT_TOOL_ID,
			cwd: meta.cwd,
			title: meta.title,
			supplement: meta.title,
			rounds: projectExternalBriefingRounds(cursorRecordsToEvents(parsed.records)),
			identityPath: path,
			bodyPath: path,
		};
	},
};

async function collectCursorTranscripts(root: string, host: ExternalSessionFileHost): Promise<string[]> {
	return collectFiles(host, root, {
		maxDepth: 4,
		enter: (name) => name !== "subagents" && name !== "agent-tools",
		include: (_name, path) => isJsonlPath(path, host.basename) && !path.includes("subagents"),
		matches: (path) => looksLikeCursorAgentSession(path, host),
	});
}

function looksLikeCursorAgentSession(path: string, host: ExternalSessionFileHost): boolean {
	if (!isJsonlPath(path, host.basename) || !host.exists(path)) return false;
	try {
		const parsed = parseJsonlRecords(host.readPrefixLines(path, EXTERNAL_HEADER_SCAN_LINES));
		const first = parsed.records[0];
		if (!first || first.type !== undefined) return false;
		const role = readNonEmptyString(first.role);
		return (role === "user" || role === "assistant") && asRecord(first.message) !== undefined;
	} catch {
		return false;
	}
}

function readCursorListMeta(
	records: readonly Record<string, unknown>[],
	fileName: string,
	path: string,
	host: ExternalSessionFileHost,
) {
	const id = fileName.replace(/\.jsonl$/i, "");
	let title = "";
	for (const record of records) {
		if (readNonEmptyString(record.role) !== "user") continue;
		const message = asRecord(record.message) ?? record;
		const text = unwrapUserQuery(readTextParts(message.content));
		if (text) {
			title = text.slice(0, 120);
			break;
		}
	}
	return { id, cwd: decodeCursorProjectCwd(path, host), title, lastActiveAt: 0 };
}

function decodeCursorProjectCwd(path: string, host: ExternalSessionFileHost): string {
	const encoded = encodedCursorProjectName(path, host);
	if (!encoded) return "";
	const parts = encoded.split("-").filter((part) => part.length > 0);
	if (parts.length === 0) return "";
	const drive = parts[0];
	if (drive && /^[A-Za-z]$/.test(drive)) {
		const windows = reconstructExistingPath(
			parts.slice(1),
			`${drive.toUpperCase()}:`,
			(parent, segment) => `${parent}\\${segment}`,
			(candidate) => host.exists(candidate),
		);
		if (windows) return windows;
	}
	return reconstructExistingPath(
		parts,
		"/",
		(parent, segment) => (parent === "/" ? `/${segment}` : host.join(parent, segment)),
		(candidate) => host.exists(candidate),
	);
}

function reconstructExistingPath(
	parts: readonly string[],
	root: string,
	joinSegment: (parent: string, segment: string) => string,
	exists: (path: string) => boolean,
): string {
	if (parts.length === 0) return exists(root) ? root : "";
	let current = root;
	let index = 0;
	while (index < parts.length) {
		let segment = parts[index] ?? "";
		index += 1;
		let candidate = joinSegment(current, segment);
		while (index < parts.length && !exists(candidate)) {
			segment = `${segment}-${parts[index]}`;
			index += 1;
			candidate = joinSegment(current, segment);
		}
		current = candidate;
	}
	return exists(current) ? current : "";
}

function encodedCursorProjectName(path: string, host: ExternalSessionFileHost): string | undefined {
	let current = path;
	for (let depth = 0; depth < 6; depth += 1) {
		const name = host.basename(current);
		const parent = host.join(current, "..");
		if (name === "agent-transcripts") return host.basename(parent);
		if (parent === current) return undefined;
		current = parent;
	}
	return undefined;
}

function cursorRecordsToEvents(records: readonly Record<string, unknown>[]): ExternalConversationEvent[] {
	const events: ExternalConversationEvent[] = [];
	let toolIndex = 0;
	for (const record of records) {
		const role = readNonEmptyString(record.role);
		const message = asRecord(record.message) ?? record;
		const content = message.content;
		if (role === "user") {
			const text = unwrapUserQuery(readTextParts(content));
			if (text) events.push({ kind: "user", text });
			continue;
		}
		if (role !== "assistant") continue;
		if (typeof content === "string" && content.trim()) {
			events.push({ kind: "assistant", text: content.trim() });
			continue;
		}
		if (!Array.isArray(content)) continue;
		for (const part of content) {
			const block = asRecord(part);
			if (!block) continue;
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
