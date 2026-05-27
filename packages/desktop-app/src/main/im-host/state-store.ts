import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { atomicWriteJSON } from "../utils/atomic-write.js";
import type { SessionStateEntry } from "./host-protocol.js";

/**
 * Persistent IM routing table. Mirror of the in-memory MemoryStore inside
 * the sidecar. The sidecar streams state_patch events on every change; we
 * apply them here and atomically rewrite the file. On sidecar (re)start we
 * read this file and replay the snapshot via the init frame.
 *
 * Path: ~/.vetta/desktop-app/im-state.json
 *
 * Schema v2: keyed by (userId, chatId) instead of (userId, projectId).
 * Pre-v2 files are dropped on load — see ADR-0004 (the new model collapses
 * all IM sessions into the default "对话" cwd, so old per-project routing
 * entries are not migrate-able).
 */
export interface ImStateFile {
	version: 2;
	sessions: SessionStateEntry[];
}

const STATE_VERSION = 2;
const DEFAULT_PATH = join(homedir(), ".vetta", "desktop-app", "im-state.json");

export function defaultImStatePath(): string {
	return DEFAULT_PATH;
}

export function loadImState(filePath = DEFAULT_PATH): ImStateFile {
	if (!existsSync(filePath)) {
		return { version: STATE_VERSION, sessions: [] };
	}
	try {
		const raw = readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(raw) as { version?: number; sessions?: unknown };
		if (parsed.version !== STATE_VERSION) {
			// Legacy file (v1 used projectId). Start fresh — see ADR-0004.
			return { version: STATE_VERSION, sessions: [] };
		}
		return {
			version: STATE_VERSION,
			sessions: Array.isArray(parsed.sessions) ? (parsed.sessions as SessionStateEntry[]) : [],
		};
	} catch {
		return { version: STATE_VERSION, sessions: [] };
	}
}

export function saveImState(state: ImStateFile, filePath = DEFAULT_PATH): void {
	atomicWriteJSON(filePath, state);
}

/**
 * Apply a single state_patch and return the new state. Empty sessionPath
 * means "delete this entry"; otherwise upsert.
 */
export function applyStatePatch(state: ImStateFile, patch: SessionStateEntry): ImStateFile {
	const sessions = state.sessions.filter((s) => !(s.userId === patch.userId && s.chatId === patch.chatId));
	if (patch.sessionPath) {
		sessions.push(patch);
	}
	return { version: STATE_VERSION, sessions };
}
