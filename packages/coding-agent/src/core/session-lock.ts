/**
 * Session file locking.
 *
 * Sessions are .jsonl files written by SessionManager. The file format has no
 * concurrent-write support: two SessionManager instances pointing at the same
 * file silently corrupt each other's history. Their in-memory entry arrays
 * diverge from disk, and the next compaction's _rewriteFile() wipes the
 * other process's appends.
 *
 * This module enforces a single-writer rule via a sentinel `<sessionFile>.lock`
 * created with O_EXCL. The lockfile records pid + hostname + start time.
 * If acquisition fails, we read the existing lock and try `process.kill(pid, 0)`
 * to detect stale locks (process crashed without cleanup) and reclaim them.
 *
 * The lock is advisory: any cooperating process must call acquireSessionLock
 * before opening a session file. Hosts (rpc mode, RuntimeHost in desktop-app,
 * direct SDK consumers) all flow through SessionManager, so the SessionManager
 * lifecycle is the single choke point that participates.
 */

import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { hostname } from "node:os";

export interface SessionLockInfo {
	pid: number;
	hostname: string;
	openedAt: string;
}

export class SessionLockError extends Error {
	constructor(
		public readonly lockPath: string,
		public readonly holder: SessionLockInfo,
	) {
		super(
			`Session file is in use by another process ` +
				`(pid ${holder.pid}@${holder.hostname}, opened ${holder.openedAt}). ` +
				`Lock file: ${lockPath}`,
		);
		this.name = "SessionLockError";
	}
}

export interface SessionLockHandle {
	readonly lockPath: string;
	release(): void;
}

function lockPathFor(sessionFile: string): string {
	return `${sessionFile}.lock`;
}

function isProcessAlive(pid: number, lockHostname: string): boolean {
	// Cross-host locks: we cannot probe a remote host's pids, so assume alive.
	// This is the safe choice for shared filesystems.
	if (lockHostname !== hostname()) return true;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function readLockInfo(lockPath: string): SessionLockInfo | undefined {
	try {
		const raw = readFileSync(lockPath, "utf8");
		const parsed = JSON.parse(raw) as Partial<SessionLockInfo>;
		if (
			typeof parsed.pid === "number" &&
			typeof parsed.hostname === "string" &&
			typeof parsed.openedAt === "string"
		) {
			return parsed as SessionLockInfo;
		}
	} catch {
		// Unreadable / malformed lockfile — treated as stale
	}
	return undefined;
}

function writeLockFile(lockPath: string): void {
	// "wx" = O_WRONLY | O_CREAT | O_EXCL. Throws EEXIST if the file already exists,
	// guaranteeing we are the sole creator.
	const fd = openSync(lockPath, "wx");
	try {
		const info: SessionLockInfo = {
			pid: process.pid,
			hostname: hostname(),
			openedAt: new Date().toISOString(),
		};
		writeSync(fd, JSON.stringify(info));
	} finally {
		closeSync(fd);
	}
}

/**
 * Acquire an exclusive advisory lock on a session file.
 *
 * - Throws SessionLockError if another live process holds the lock.
 * - Stale locks (dead pids on the same host) are reclaimed automatically.
 * - The lock is released by calling `handle.release()`. release() is idempotent.
 */
export function acquireSessionLock(sessionFile: string): SessionLockHandle {
	const lockPath = lockPathFor(sessionFile);

	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			writeLockFile(lockPath);
			let released = false;
			return {
				lockPath,
				release() {
					if (released) return;
					released = true;
					try {
						unlinkSync(lockPath);
					} catch {
						// Best effort: lockfile may have been removed externally.
					}
				},
			};
		} catch (err: unknown) {
			const code = (err as NodeJS.ErrnoException).code;
			if (code !== "EEXIST") throw err;

			const holder = readLockInfo(lockPath);
			if (holder && isProcessAlive(holder.pid, holder.hostname)) {
				throw new SessionLockError(lockPath, holder);
			}

			// Stale lock — try to remove it and retry once. If a race causes
			// the unlink to fail, the next attempt's writeLockFile will surface it.
			try {
				unlinkSync(lockPath);
			} catch {
				// Race: another process already cleaned up. Retry will recreate.
			}
		}
	}

	throw new Error(`Failed to acquire session lock at ${lockPath} after retry`);
}
