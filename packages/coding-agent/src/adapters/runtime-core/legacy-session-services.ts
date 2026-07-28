import { rm } from "node:fs/promises";
import type {
	HistoryEntry,
	ProjectInfo,
	RuntimeSessionCatalog,
	RuntimeSessionFileHistoryReader,
	RuntimeSharedModelController,
	SessionHistoryInfo,
} from "@vetta/runtime-core";
import type { ModelRegistry } from "../../core/model-registry.js";
import {
	type SessionEntry as CodingSessionEntry,
	loadEntriesFromFile,
	type SessionInfo,
	SessionManager,
} from "../../core/session-manager/index.js";
import { branchFromFileEntries, entriesToHistory } from "./history.js";

export class LegacyRuntimeSharedModelController implements RuntimeSharedModelController {
	constructor(private readonly modelRegistry: ModelRegistry) {}

	async refreshAuth(token: string | undefined): Promise<void> {
		this.modelRegistry.setServerToken(token);
		await this.modelRegistry.loadRemoteModels();
	}

	refreshInBackground(): void {
		void this.modelRegistry.loadRemoteModels();
	}
}

export class LegacyRuntimeSessionCatalog implements RuntimeSessionCatalog {
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

export class LegacyRuntimeSessionFileHistoryReader implements RuntimeSessionFileHistoryReader {
	read(sessionPath: string): { history: HistoryEntry[] } {
		const fileEntries = loadEntriesFromFile(sessionPath);
		const branch = branchFromFileEntries(fileEntries);
		const allEntries = fileEntries.filter((entry): entry is CodingSessionEntry => entry.type !== "session");
		return { history: entriesToHistory(branch, { allEntries }) };
	}
}
