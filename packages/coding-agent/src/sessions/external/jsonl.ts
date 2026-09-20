export const EXTERNAL_HEADER_SCAN_LINES = 64;

export function parseJsonlRecords(body: string): {
	readonly records: readonly Record<string, unknown>[];
	readonly skippedLineCount: number;
} {
	const records: Record<string, unknown>[] = [];
	let skippedLineCount = 0;
	for (const line of body.split(/\r?\n/)) {
		if (!line.trim()) continue;
		try {
			const value: unknown = JSON.parse(line);
			if (typeof value === "object" && value !== null && !Array.isArray(value)) {
				records.push(value as Record<string, unknown>);
			} else {
				skippedLineCount += 1;
			}
		} catch {
			skippedLineCount += 1;
		}
	}
	return { records, skippedLineCount };
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

export function readNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function readNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function readTimestamp(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value < 1_000_000_000_000 ? value * 1000 : value;
	}
	if (typeof value !== "string") return undefined;
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function unwrapUserQuery(text: string): string {
	const match = /<user_query>\s*([\s\S]*?)\s*<\/user_query>/.exec(text);
	return (match?.[1] ?? text).trim();
}

export function readTextParts(value: unknown): string {
	if (typeof value === "string") return value;
	if (!Array.isArray(value)) return "";
	return value
		.flatMap((part) => {
			if (typeof part === "string") return [part];
			const record = asRecord(part);
			if (!record) return [];
			const text = readNonEmptyString(record.text) ?? readNonEmptyString(record.content);
			return text ? [text] : [];
		})
		.join("");
}

export function parseToolArguments(value: unknown): Record<string, unknown> {
	if (typeof value === "string") {
		try {
			const parsed: unknown = JSON.parse(value);
			return asRecord(parsed) ?? {};
		} catch {
			return {};
		}
	}
	return asRecord(value) ?? {};
}

export function stringifyToolContent(value: unknown): string {
	if (typeof value === "string") return value;
	const fromParts = readTextParts(value);
	if (fromParts) return fromParts;
	if (value === undefined || value === null) return "";
	try {
		return JSON.stringify(value);
	} catch {
		return "";
	}
}

export function isJsonlPath(path: string, basename: (value: string) => string): boolean {
	return basename(path).toLowerCase().endsWith(".jsonl");
}
