import type { ProjectInfo, RuntimeSessionAccess, RuntimeSessionCatalog, SessionHistoryInfo } from "@vetta/runtime-core";
import {
	EXTERNAL_SESSION_ACTIVITY_WINDOW_MS,
	type ExternalSessionUnavailableReason,
	findGrokSummaryHeader,
	GROK_HEADER_SCAN_LINES,
	GROK_SUMMARY_SIDECAR_NAME,
	GROK_TOOL_ID,
	MAX_UNAVAILABLE_EXTERNAL_SESSIONS,
} from "./grok-summary.js";
import type { ExternalSessionFileHost } from "./host-contracts.js";

export const EXTERNAL_READONLY_SESSION_ACCESS: RuntimeSessionAccess = {
	readHistory: true,
	resume: false,
	rename: false,
	delete: false,
};

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
		if (this.host.basename(sessionPath) !== GROK_SUMMARY_SIDECAR_NAME) return false;
		try {
			return findGrokSummaryHeader(this.host.readPrefixLines(sessionPath, GROK_HEADER_SCAN_LINES)).kind === "ok";
		} catch {
			return false;
		}
	}

	async listProjects(): Promise<ProjectInfo[]> {
		return [];
	}

	async listSessions(cwd: string, sessionDir?: string): Promise<SessionHistoryInfo[]> {
		const root = this.host.resolveSessionsDirectory();
		if (!root) return [];
		const requested = sessionDir ?? cwd;
		if (!this.host.samePath(requested, root)) return [];
		return this.listGrokSessions(root);
	}

	async renameSession(): Promise<void> {
		throw new Error("External sessions are read-only");
	}

	async deleteSessionArtifacts(): Promise<void> {
		throw new Error("External sessions are read-only");
	}

	private async listGrokSessions(root: string): Promise<SessionHistoryInfo[]> {
		const now = this.options.now?.() ?? Date.now();
		const windowMs = this.options.activityWindowMs ?? EXTERNAL_SESSION_ACTIVITY_WINDOW_MS;
		const maxUnavailable = this.options.maxUnavailable ?? MAX_UNAVAILABLE_EXTERNAL_SESSIONS;
		const cutoff = now - windowMs;
		const available: SessionHistoryInfo[] = [];
		const unavailable: SessionHistoryInfo[] = [];
		for (const sidecarPath of await this.collectSummarySidecars(root)) {
			const item = await this.projectSidecar(sidecarPath, cutoff);
			if (!item) continue;
			if (item.unavailableReason) unavailable.push(item);
			else available.push(item);
		}
		unavailable.sort(compareActivityDesc);
		return [...available, ...unavailable.slice(0, maxUnavailable)].sort(compareActivityDesc);
	}

	private async collectSummarySidecars(root: string): Promise<string[]> {
		if (!this.host.exists(root)) return [];
		const sidecars: string[] = [];
		try {
			for (const workspace of await this.host.readDirectory(root)) {
				if (workspace.kind !== "directory") continue;
				const workspacePath = this.host.join(root, workspace.name);
				for (const session of await this.host.readDirectory(workspacePath)) {
					if (session.kind !== "directory") continue;
					const sidecarPath = this.host.join(workspacePath, session.name, GROK_SUMMARY_SIDECAR_NAME);
					if (this.host.exists(sidecarPath)) sidecars.push(sidecarPath);
				}
			}
		} catch {
			return [];
		}
		return sidecars;
	}

	private async projectSidecar(sidecarPath: string, cutoff: number): Promise<SessionHistoryInfo | undefined> {
		let header: ReturnType<typeof findGrokSummaryHeader>;
		try {
			header = findGrokSummaryHeader(this.host.readPrefixLines(sidecarPath, GROK_HEADER_SCAN_LINES));
		} catch {
			return this.unavailableItem(sidecarPath, "corrupted_header", cutoff, undefined);
		}
		if (header.kind === "unrelated") return undefined;
		if (header.kind === "ok") {
			if (header.summary.lastActiveAt < cutoff) return undefined;
			return {
				id: header.summary.id,
				path: sidecarPath,
				cwd: header.summary.cwd,
				name: header.summary.title || undefined,
				firstMessage: header.summary.title,
				modifiedAt: header.summary.lastActiveAt,
				origin: { tool: GROK_TOOL_ID, path: sidecarPath },
			};
		}
		if (header.kind === "unsupported_version") {
			return this.unavailableItem(sidecarPath, "unsupported_version", cutoff, {
				id: header.id,
				cwd: header.cwd,
				title: header.title,
			});
		}
		return this.unavailableItem(sidecarPath, "corrupted_header", cutoff, undefined);
	}

	private async unavailableItem(
		sidecarPath: string,
		reason: ExternalSessionUnavailableReason,
		cutoff: number,
		known: { readonly id: string; readonly cwd: string; readonly title: string } | undefined,
	): Promise<SessionHistoryInfo | undefined> {
		const modifiedAt = await this.host.statModifiedAt(sidecarPath).catch(() => 0);
		if (modifiedAt > 0 && modifiedAt < cutoff) return undefined;
		return {
			id: known?.id || this.host.basename(this.host.join(sidecarPath, "..")),
			path: sidecarPath,
			cwd: known?.cwd ?? "",
			name: known?.title || undefined,
			firstMessage: known?.title ?? "",
			modifiedAt,
			origin: { tool: GROK_TOOL_ID, path: sidecarPath },
			unavailableReason: reason,
		};
	}
}

function compareActivityDesc(left: SessionHistoryInfo, right: SessionHistoryInfo): number {
	return right.modifiedAt - left.modifiedAt;
}
