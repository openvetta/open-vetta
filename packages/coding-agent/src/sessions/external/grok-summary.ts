export const GROK_SUPPORTED_CHAT_FORMAT_VERSION = 1;
export const GROK_SUMMARY_SIDECAR_NAME = "summary.json";
export const GROK_CONVERSATION_BODY_NAME = "chat_history.jsonl";
export const GROK_TOOL_ID = "grok";
export const GROK_HEADER_SCAN_LINES = 32;

export const EXTERNAL_SESSION_ACTIVITY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_UNAVAILABLE_EXTERNAL_SESSIONS = 8;

export type ExternalSessionUnavailableReason = "unsupported_version" | "corrupted_header";

export interface GrokSessionSummary {
	readonly id: string;
	readonly title: string;
	readonly cwd: string;
	readonly lastActiveAt: number;
	readonly version: number;
}

export type GrokSummaryHeader =
	| { readonly kind: "ok"; readonly summary: GrokSessionSummary }
	| { readonly kind: "unsupported_version"; readonly id: string; readonly cwd: string; readonly title: string }
	| { readonly kind: "corrupted_header" }
	| { readonly kind: "unrelated" };

export function findGrokSummaryHeader(prefix: string): GrokSummaryHeader {
	const parsed = parsePrefixRecords(prefix);
	if (parsed.kind === "json") {
		return (
			interpretGrokRecord(parsed.value) ??
			(hasGrokMarkers(prefix) ? { kind: "corrupted_header" } : { kind: "unrelated" })
		);
	}
	for (const record of parsed.records) {
		const header = interpretGrokRecord(record);
		if (header) return header;
	}
	return hasGrokMarkers(prefix) ? { kind: "corrupted_header" } : { kind: "unrelated" };
}

function parsePrefixRecords(
	prefix: string,
): { kind: "json"; value: unknown } | { kind: "lines"; records: readonly unknown[] } {
	try {
		return { kind: "json", value: JSON.parse(prefix) };
	} catch {
		const records: unknown[] = [];
		for (const line of prefix.split(/\r?\n/)) {
			const trimmed = line.trim();
			if (!trimmed.startsWith("{")) continue;
			try {
				records.push(JSON.parse(trimmed));
			} catch {
				// Pretty-printed or truncated lines are not standalone records.
			}
		}
		return { kind: "lines", records };
	}
}

function interpretGrokRecord(value: unknown): GrokSummaryHeader | undefined {
	if (!looksLikeGrokRecord(value)) return undefined;
	const record = value as Record<string, unknown>;
	const version = record.chat_format_version;
	const info = asRecord(record.info);
	const id = readNonEmptyString(info?.id) ?? readNonEmptyString(record.id) ?? "unknown";
	const cwd = readNonEmptyString(record.git_root_dir) ?? readNonEmptyString(info?.cwd) ?? "";
	const title = readNonEmptyString(record.generated_title) ?? "";
	if (typeof version !== "number" || !Number.isFinite(version)) return { kind: "corrupted_header" };
	if (version !== GROK_SUPPORTED_CHAT_FORMAT_VERSION) {
		return { kind: "unsupported_version", id, cwd, title };
	}
	const lastActiveAt =
		readTimestamp(record.last_active_at) ?? readTimestamp(record.updated_at) ?? readTimestamp(record.created_at);
	if (!readNonEmptyString(info?.id) || lastActiveAt === undefined) return { kind: "corrupted_header" };
	return {
		kind: "ok",
		summary: {
			id,
			title,
			cwd,
			lastActiveAt,
			version,
		},
	};
}

function looksLikeGrokRecord(value: unknown): boolean {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	if (typeof record.chat_format_version === "number") return true;
	const info = asRecord(record.info);
	return typeof info?.id === "string" && info.id.trim().length > 0;
}

function hasGrokMarkers(prefix: string): boolean {
	return prefix.includes("chat_format_version") || prefix.includes("generated_title") || prefix.includes('"info"');
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readTimestamp(value: unknown): number | undefined {
	if (typeof value !== "string") return undefined;
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) ? timestamp : undefined;
}
