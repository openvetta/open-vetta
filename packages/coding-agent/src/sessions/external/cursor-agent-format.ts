import {
	type ExternalConversationEvent,
	nextGeneratedToolId,
	projectExternalBriefingRounds,
	projectExternalConversationDisplay,
} from "./display.js";
import type { ExternalSessionFormat } from "./format.js";
import type { ExternalSessionFileHost } from "./host-contracts.js";
import { asRecord, readNonEmptyString, readNumber, readTextParts, unwrapUserQuery } from "./jsonl.js";
import { CURSOR_AGENT_TOOL_ID } from "./tool-ids.js";
import { collectFiles } from "./walk.js";

const META_FILE_NAME = "meta.json";
const PROMPT_HISTORY_FILE_NAME = "prompt_history.json";
const STORE_DB_FILE_NAME = "store.db";
const STORE_WAL_FILE_NAME = "store.db-wal";
const ROLE_JSON_START = '{"role":"';
const GENERIC_TITLES = new Set(["", "New Agent", "Cursor Agent Chat"]);

interface CursorAgentMeta {
	readonly cwd: string;
	readonly title: string;
	readonly updatedAtMs: number;
}

export const cursorAgentFormat: ExternalSessionFormat = {
	id: CURSOR_AGENT_TOOL_ID,
	ownsIdentity: looksLikeCursorAgentSession,
	canRead: looksLikeCursorAgentSession,
	collectIdentities: collectCursorSessions,
	projectListItem: projectCursorListItem,

	readHistory(path, host) {
		return projectExternalConversationDisplay({
			tool: CURSOR_AGENT_TOOL_ID,
			events: readCursorEvents(path, host),
		});
	},
	readBriefingSource(path, host) {
		if (!looksLikeCursorAgentSession(path, host)) return { error: "corrupted_header" };
		const meta = readCursorListMeta(path, host);
		if (!meta) return { error: "corrupted_header" };
		return {
			tool: CURSOR_AGENT_TOOL_ID,
			cwd: meta.cwd,
			title: meta.title,
			supplement: meta.title,
			rounds: projectExternalBriefingRounds(readCursorEvents(path, host)),
			identityPath: path,
			bodyPath: path,
		};
	},
};

async function collectCursorSessions(root: string, host: ExternalSessionFileHost): Promise<string[]> {
	return collectFiles(host, root, {
		maxDepth: 2,
		include: (name) => name === META_FILE_NAME,
	});
}

function looksLikeCursorAgentSession(path: string, host: ExternalSessionFileHost): boolean {
	return host.basename(path) === META_FILE_NAME && host.exists(path) && parseCursorMetaFile(path, host) !== undefined;
}

async function projectCursorListItem(path: string, host: ExternalSessionFileHost, cutoff: number) {
	const modifiedAt = await host.statModifiedAt(path).catch(() => 0);
	if (modifiedAt > 0 && modifiedAt < cutoff) return undefined;
	const meta = readCursorListMeta(path, host);
	if (!meta) {
		return {
			id: sessionIdFromMetaPath(path, host),
			path,
			cwd: "",
			firstMessage: "",
			modifiedAt,
			origin: { tool: CURSOR_AGENT_TOOL_ID, path },
			unavailableReason: "corrupted_header" as const,
		};
	}
	const activity = meta.lastActiveAt > 0 ? meta.lastActiveAt : modifiedAt;
	if (activity > 0 && activity < cutoff) return undefined;
	return {
		id: meta.id,
		path,
		cwd: meta.cwd,
		name: meta.title || undefined,
		firstMessage: meta.title,
		modifiedAt: activity || modifiedAt,
		origin: { tool: CURSOR_AGENT_TOOL_ID, path },
	};
}

function readCursorListMeta(path: string, host: ExternalSessionFileHost) {
	const parsed = parseCursorMetaFile(path, host);
	if (!parsed) return undefined;
	const title = resolveCursorTitle(parsed, path, host);
	return {
		id: sessionIdFromMetaPath(path, host),
		cwd: parsed.cwd,
		title,
		lastActiveAt: parsed.updatedAtMs,
	};
}

function parseCursorMetaFile(path: string, host: ExternalSessionFileHost): CursorAgentMeta | undefined {
	try {
		const record = asRecord(JSON.parse(host.readText(path)) as unknown);
		if (!record) return undefined;
		if (record.schemaVersion !== undefined && readNumber(record.schemaVersion) === undefined) return undefined;
		const cwd = typeof record.cwd === "string" ? record.cwd : "";
		const title = typeof record.title === "string" ? record.title : "";
		const updatedAtMs = readNumber(record.updatedAtMs) ?? 0;
		if (record.schemaVersion === undefined && !cwd && !title && updatedAtMs === 0) return undefined;
		return { cwd, title, updatedAtMs };
	} catch {
		return undefined;
	}
}

function resolveCursorTitle(meta: CursorAgentMeta, path: string, host: ExternalSessionFileHost): string {
	if (!GENERIC_TITLES.has(meta.title.trim())) return meta.title.trim();
	const prompts = readPromptHistory(path, host);
	return (prompts[0] ?? meta.title).trim();
}

function readCursorEvents(path: string, host: ExternalSessionFileHost): ExternalConversationEvent[] {
	const fromStore = cursorRecordsToEvents(readStoreRoleRecords(path, host));
	if (fromStore.some((event) => event.kind === "user" || event.kind === "assistant")) return fromStore;
	return readPromptHistory(path, host).map((text) => ({ kind: "user" as const, text }));
}

function readStoreRoleRecords(path: string, host: ExternalSessionFileHost): Record<string, unknown>[] {
	const sessionDir = host.join(path, "..");
	const seen = new Set<string>();
	const records: Record<string, unknown>[] = [];
	for (const name of [STORE_DB_FILE_NAME, STORE_WAL_FILE_NAME]) {
		const file = host.join(sessionDir, name);
		if (!host.exists(file)) continue;
		try {
			for (const record of extractRoleJsonRecords(host.readText(file))) {
				const role = readNonEmptyString(record.role);
				if (role !== "user" && role !== "assistant") continue;
				const key = `${role}\0${JSON.stringify(record.content ?? asRecord(record.message)?.content ?? "")}`;
				if (seen.has(key)) continue;
				seen.add(key);
				records.push(normalizeCursorRecord(record));
			}
		} catch {
			// Binary pages may fail to decode; later files or prompt_history still apply.
		}
	}
	return records;
}

function readPromptHistory(path: string, host: ExternalSessionFileHost): string[] {
	const file = host.join(path, "..", PROMPT_HISTORY_FILE_NAME);
	if (!host.exists(file)) return [];
	try {
		const value: unknown = JSON.parse(host.readText(file));
		if (!Array.isArray(value)) return [];
		return value.flatMap((item) => {
			const text = readNonEmptyString(item);
			return text ? [unwrapUserQuery(text)] : [];
		});
	} catch {
		return [];
	}
}

function extractRoleJsonRecords(body: string): Record<string, unknown>[] {
	const records: Record<string, unknown>[] = [];
	let from = 0;
	while (from < body.length) {
		const start = body.indexOf(ROLE_JSON_START, from);
		if (start < 0) break;
		const parsed = parseJsonObjectAt(body, start);
		if (parsed) {
			records.push(parsed.value);
			from = parsed.end;
			continue;
		}
		from = start + ROLE_JSON_START.length;
	}
	return records;
}

function parseJsonObjectAt(source: string, start: number): { value: Record<string, unknown>; end: number } | undefined {
	if (source[start] !== "{") return undefined;
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let index = start; index < source.length; index += 1) {
		const char = source[index];
		if (inString) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (char === "\\") {
				escaped = true;
				continue;
			}
			if (char === '"') inString = false;
			continue;
		}
		if (char === '"') {
			inString = true;
			continue;
		}
		if (char === "{") depth += 1;
		if (char === "}") {
			depth -= 1;
			if (depth !== 0) continue;
			try {
				const value: unknown = JSON.parse(source.slice(start, index + 1));
				const record = asRecord(value);
				return record ? { value: record, end: index + 1 } : undefined;
			} catch {
				return undefined;
			}
		}
	}
	return undefined;
}

function normalizeCursorRecord(record: Record<string, unknown>): Record<string, unknown> {
	if (asRecord(record.message)) return record;
	return { role: record.role, message: { content: record.content } };
}

function sessionIdFromMetaPath(path: string, host: ExternalSessionFileHost): string {
	return host.basename(host.join(path, ".."));
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
