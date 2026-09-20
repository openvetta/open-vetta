import type { HistoryEntry, SessionHistoryInfo } from "@vetta/runtime-core";
import type { ExternalBriefingRound } from "./display.js";
import type { ExternalSessionFileHost } from "./host-contracts.js";
import type { ExternalSessionToolId } from "./tool-ids.js";

export interface ExternalSessionBriefingSource {
	readonly tool: ExternalSessionToolId;
	readonly cwd: string;
	readonly title: string;
	readonly supplement: string;
	readonly rounds: readonly ExternalBriefingRound[];
	readonly identityPath: string;
	readonly bodyPath?: string;
}

export interface ExternalSessionFormat {
	readonly id: ExternalSessionToolId;
	ownsIdentity(path: string, host: ExternalSessionFileHost): boolean;
	canRead(path: string, host: ExternalSessionFileHost): boolean;
	collectIdentities(root: string, host: ExternalSessionFileHost): Promise<string[]>;
	projectListItem(
		path: string,
		host: ExternalSessionFileHost,
		cutoff: number,
	): Promise<SessionHistoryInfo | undefined>;
	readHistory(path: string, host: ExternalSessionFileHost): HistoryEntry[];
	readBriefingSource(
		path: string,
		host: ExternalSessionFileHost,
	): ExternalSessionBriefingSource | { readonly error: "corrupted_header" | "unsupported_version" };
}
