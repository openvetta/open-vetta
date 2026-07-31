import { rm } from "node:fs/promises";
import type { ProjectInfo, RuntimeSessionCatalog, SessionHistoryInfo } from "@vetta/runtime-core";
import { type SessionInfo, SessionManager } from "../../../core/session-manager/index.js";
import { isLegacySessionFile } from "./header-reader.js";

/** 旧 Coding Agent JSONL 的发现、命名与删除适配；不创建 AgentSession。 */
export class LegacyRuntimeSessionCatalog implements RuntimeSessionCatalog {
	ownsSession(sessionPath: string): Promise<boolean> {
		return isLegacySessionFile(sessionPath);
	}

	async listProjects(): Promise<ProjectInfo[]> {
		const sessions = await SessionManager.listAll();
		const byCwd = new Map<string, number>();
		for (const session of sessions) {
			const key = session.cwd || process.cwd();
			byCwd.set(key, (byCwd.get(key) ?? 0) + 1);
		}
		return Array.from(byCwd.entries())
			.map(([cwd, sessionCount]) => ({ cwd, sessionCount }))
			.sort((a, b) => a.cwd.localeCompare(b.cwd));
	}

	async listSessions(cwd: string, sessionDir?: string): Promise<SessionHistoryInfo[]> {
		const sessions = await SessionManager.list(cwd, sessionDir);
		return sessions.map((session: SessionInfo) => ({
			id: session.id,
			path: session.path,
			cwd: session.cwd,
			name: session.name,
			firstMessage: session.firstMessage,
			modifiedAt: session.modified.getTime(),
			lastMessagePreview: session.lastMessagePreview,
			parentSessionPath: session.parentSessionPath,
			parentEntryId: session.parentEntryId,
		}));
	}

	async renameSession(sessionPath: string, name: string): Promise<void> {
		const manager = SessionManager.open(sessionPath);
		try {
			manager.appendSessionInfo(name);
		} finally {
			manager.close();
		}
	}

	async deleteSessionArtifacts(sessionPath: string): Promise<void> {
		await rm(sessionPath, { force: true });
		await rm(`${sessionPath}.lock`, { force: true });
	}
}
