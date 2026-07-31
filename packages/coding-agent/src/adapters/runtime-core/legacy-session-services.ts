import { closeSync, openSync, readSync } from "node:fs";
import { type FileHandle, open, rm } from "node:fs/promises";
import type {
	HistoryEntry,
	ProjectInfo,
	RuntimeSessionCatalog,
	RuntimeSessionFileHistoryReader,
	SessionHistoryInfo,
} from "@vetta/runtime-core";
import {
	type SessionEntry as CodingSessionEntry,
	loadEntriesFromFile,
	type SessionInfo,
	SessionManager,
} from "../../core/session-manager/index.js";
import { branchFromFileEntries, entriesToHistory } from "./history.js";
import { ModelRegistryRuntimeSharedModelController } from "./model-registry-shared-model-controller.js";

const SESSION_HEADER_READ_BYTES = 64 * 1024;

/** @deprecated 请使用 ModelRegistryRuntimeSharedModelController。 */
export class LegacyRuntimeSharedModelController extends ModelRegistryRuntimeSharedModelController {}

export class LegacyRuntimeSessionCatalog implements RuntimeSessionCatalog {
	async ownsSession(sessionPath: string): Promise<boolean> {
		try {
			return isLegacySessionHeader(await readFirstLine(sessionPath));
		} catch {
			return false;
		}
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

export class LegacyRuntimeSessionFileHistoryReader implements RuntimeSessionFileHistoryReader {
	canRead(sessionPath: string): boolean {
		try {
			return isLegacySessionHeader(readFirstLineSync(sessionPath));
		} catch {
			return false;
		}
	}

	read(sessionPath: string): { history: HistoryEntry[] } {
		const fileEntries = loadEntriesFromFile(sessionPath);
		const branch = branchFromFileEntries(fileEntries);
		const allEntries = fileEntries.filter((entry): entry is CodingSessionEntry => entry.type !== "session");
		return { history: entriesToHistory(branch, { allEntries }) };
	}
}

function isLegacySessionHeader(firstLine: string | undefined): boolean {
	if (!firstLine) return false;
	try {
		const value: unknown = JSON.parse(firstLine);
		return (
			typeof value === "object" &&
			value !== null &&
			"type" in value &&
			value.type === "session" &&
			"cwd" in value &&
			typeof value.cwd === "string"
		);
	} catch {
		return false;
	}
}

async function readFirstLine(path: string): Promise<string | undefined> {
	let handle: FileHandle | undefined;
	try {
		handle = await open(path, "r");
		const buffer = Buffer.alloc(SESSION_HEADER_READ_BYTES);
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
		return firstCompleteLine(buffer, bytesRead);
	} finally {
		await handle?.close();
	}
}

function readFirstLineSync(path: string): string | undefined {
	const descriptor = openSync(path, "r");
	try {
		const buffer = Buffer.alloc(SESSION_HEADER_READ_BYTES);
		return firstCompleteLine(buffer, readSync(descriptor, buffer, 0, buffer.length, 0));
	} finally {
		closeSync(descriptor);
	}
}

function firstCompleteLine(buffer: Buffer, bytesRead: number): string | undefined {
	const text = buffer.toString("utf8", 0, bytesRead);
	const newline = text.indexOf("\n");
	if (newline === -1 && bytesRead === buffer.length) return undefined;
	return (newline === -1 ? text : text.slice(0, newline)).replace(/\r$/, "") || undefined;
}
