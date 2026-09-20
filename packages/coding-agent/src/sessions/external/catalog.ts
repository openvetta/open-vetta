import type { ProjectInfo, RuntimeSessionAccess, RuntimeSessionCatalog, SessionHistoryInfo } from "@vetta/runtime-core";
import { createAsyncExecutionGate } from "@vetta/runtime-tools";
import { formatForTool, identifyExternalSessionFormat } from "./formats.js";
import { EXTERNAL_SESSION_ACTIVITY_WINDOW_MS, MAX_UNAVAILABLE_EXTERNAL_SESSIONS } from "./grok-summary.js";
import type { ExternalSessionFileHost } from "./host-contracts.js";

export const EXTERNAL_READONLY_SESSION_ACCESS: RuntimeSessionAccess = {
	readHistory: true,
	resume: false,
	rename: false,
	delete: false,
};

/** Max parallel list-item projections per external root, to avoid EMFILE on large Codex/Cursor trees. */
export const EXTERNAL_SESSION_LIST_CONCURRENCY = 16;

export interface ExternalRuntimeSessionCatalogOptions {
	readonly now?: () => number;
	readonly activityWindowMs?: number;
	readonly maxUnavailable?: number;
}

/** 外部工具会话的发现与 Tier-0 投影；不创建 AgentSession，不加锁、不写回。 */
export class ExternalRuntimeSessionCatalog implements RuntimeSessionCatalog {
	constructor(
		private readonly host: ExternalSessionFileHost,
		private readonly options: ExternalRuntimeSessionCatalogOptions = {},
	) {}

	async ownsSession(sessionPath: string): Promise<boolean> {
		try {
			return identifyExternalSessionFormat(sessionPath, this.host)?.ownsIdentity(sessionPath, this.host) === true;
		} catch {
			return false;
		}
	}

	async listProjects(): Promise<ProjectInfo[]> {
		return [];
	}

	async listSessions(cwd: string, sessionDir?: string): Promise<SessionHistoryInfo[]> {
		const roots = this.host.resolveSessionRoots();
		if (roots.length === 0) return [];
		const requested = sessionDir ?? cwd;
		if (!roots.some((root) => this.host.samePath(requested, root.path))) return [];
		const now = this.options.now?.() ?? Date.now();
		const windowMs = this.options.activityWindowMs ?? EXTERNAL_SESSION_ACTIVITY_WINDOW_MS;
		const maxUnavailable = this.options.maxUnavailable ?? MAX_UNAVAILABLE_EXTERNAL_SESSIONS;
		const cutoff = now - windowMs;
		const available: SessionHistoryInfo[] = [];
		const unavailable: SessionHistoryInfo[] = [];
		for (const root of roots) {
			const format = formatForTool(root.tool);
			if (!format) continue;
			const paths = await format.collectIdentities(root.path, this.host);
			const gate = createAsyncExecutionGate(EXTERNAL_SESSION_LIST_CONCURRENCY);
			const items = await Promise.all(
				paths.map((path) => gate.run(() => format.projectListItem(path, this.host, cutoff))),
			);
			for (const item of items) {
				if (!item) continue;
				if (item.unavailableReason) unavailable.push(item);
				else available.push(item);
			}
		}
		unavailable.sort(compareActivityDesc);
		return [...available, ...unavailable.slice(0, maxUnavailable)].sort(compareActivityDesc);
	}

	async renameSession(): Promise<void> {
		throw new Error("External sessions are read-only");
	}

	async deleteSessionArtifacts(): Promise<void> {
		throw new Error("External sessions are read-only");
	}
}

function compareActivityDesc(left: SessionHistoryInfo, right: SessionHistoryInfo): number {
	return right.modifiedAt - left.modifiedAt;
}
