import type { SessionHistoryInfo } from "@vetta/runtime-core";
import type { ExternalSessionFileHost } from "./host-contracts.js";
import { EXTERNAL_HEADER_SCAN_LINES, parseJsonlRecords } from "./jsonl.js";

export async function projectJsonlListItem(
	path: string,
	host: ExternalSessionFileHost,
	cutoff: number,
	tool: string,
	readMeta: (
		records: readonly Record<string, unknown>[],
		fileName: string,
	) => { id: string; cwd: string; title: string; lastActiveAt: number },
): Promise<SessionHistoryInfo | undefined> {
	const modifiedAt = await host.statModifiedAt(path).catch(() => 0);
	if (modifiedAt > 0 && modifiedAt < cutoff) return undefined;
	let records: readonly Record<string, unknown>[] = [];
	try {
		records = parseJsonlRecords(host.readPrefixLines(path, EXTERNAL_HEADER_SCAN_LINES)).records;
	} catch {
		return {
			id: host.basename(path).replace(/\.jsonl$/i, ""),
			path,
			cwd: "",
			firstMessage: "",
			modifiedAt,
			origin: { tool, path },
			unavailableReason: "corrupted_header",
		};
	}
	const meta = readMeta(records, host.basename(path));
	const activity = meta.lastActiveAt > 0 ? meta.lastActiveAt : modifiedAt;
	if (activity > 0 && activity < cutoff) return undefined;
	return {
		id: meta.id,
		path,
		cwd: meta.cwd,
		name: meta.title || undefined,
		firstMessage: meta.title,
		modifiedAt: activity || modifiedAt,
		origin: { tool, path },
	};
}
