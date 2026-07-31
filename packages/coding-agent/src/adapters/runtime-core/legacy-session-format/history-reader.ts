import type { HistoryEntry, RuntimeSessionFileHistoryReader } from "@vetta/runtime-core";
import { type SessionEntry as CodingSessionEntry, loadEntriesFromFile } from "../../../core/session-manager/index.js";
import { branchFromFileEntries, entriesToHistory } from "../history.js";
import { isLegacySessionFileSync } from "./header-reader.js";

/** 将旧 Coding Agent JSONL 直接投影为 Runtime History；不创建 AgentSession。 */
export class LegacyRuntimeSessionFileHistoryReader implements RuntimeSessionFileHistoryReader {
	canRead(sessionPath: string): boolean {
		return isLegacySessionFileSync(sessionPath);
	}

	read(sessionPath: string): { history: HistoryEntry[] } {
		const fileEntries = loadEntriesFromFile(sessionPath);
		const branch = branchFromFileEntries(fileEntries);
		const allEntries = fileEntries.filter((entry): entry is CodingSessionEntry => entry.type !== "session");
		return { history: entriesToHistory(branch, { allEntries }) };
	}
}
