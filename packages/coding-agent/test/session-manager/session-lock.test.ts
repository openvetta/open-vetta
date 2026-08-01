import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acquireSessionLock, SessionLockError } from "../../src/core/session-lock.js";
import { SessionManager } from "../../src/core/session-manager/index.js";

describe("acquireSessionLock", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `session-lock-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("creates a .lock sibling file with O_EXCL semantics", () => {
		const sessionFile = join(tempDir, "a.jsonl");
		const handle = acquireSessionLock(sessionFile);
		expect(handle.lockPath).toBe(`${sessionFile}.lock`);
		expect(existsSync(handle.lockPath)).toBe(true);
		handle.release();
		expect(existsSync(handle.lockPath)).toBe(false);
	});

	it("records pid + hostname + openedAt in the lockfile", () => {
		const sessionFile = join(tempDir, "b.jsonl");
		const handle = acquireSessionLock(sessionFile);
		try {
			const info = JSON.parse(readFileSync(handle.lockPath, "utf8"));
			expect(info.pid).toBe(process.pid);
			expect(typeof info.hostname).toBe("string");
			expect(info.hostname.length).toBeGreaterThan(0);
			expect(typeof info.openedAt).toBe("string");
			expect(Number.isFinite(Date.parse(info.openedAt))).toBe(true);
		} finally {
			handle.release();
		}
	});

	it("throws SessionLockError when a live process holds the lock", () => {
		const sessionFile = join(tempDir, "c.jsonl");
		const first = acquireSessionLock(sessionFile);
		try {
			expect(() => acquireSessionLock(sessionFile)).toThrow(SessionLockError);
		} finally {
			first.release();
		}
	});

	it("error includes the lock holder info for diagnostics", () => {
		const sessionFile = join(tempDir, "d.jsonl");
		const first = acquireSessionLock(sessionFile);
		try {
			try {
				acquireSessionLock(sessionFile);
				expect.unreachable("expected SessionLockError");
			} catch (err) {
				expect(err).toBeInstanceOf(SessionLockError);
				const lockErr = err as SessionLockError;
				expect(lockErr.holder.pid).toBe(process.pid);
				expect(lockErr.lockPath).toBe(`${sessionFile}.lock`);
			}
		} finally {
			first.release();
		}
	});

	it("release() is idempotent", () => {
		const sessionFile = join(tempDir, "e.jsonl");
		const handle = acquireSessionLock(sessionFile);
		handle.release();
		expect(() => handle.release()).not.toThrow();
	});

	it("re-acquires after release", () => {
		const sessionFile = join(tempDir, "f.jsonl");
		const first = acquireSessionLock(sessionFile);
		first.release();
		const second = acquireSessionLock(sessionFile);
		try {
			expect(existsSync(second.lockPath)).toBe(true);
		} finally {
			second.release();
		}
	});

	it("reclaims a stale lockfile from a dead pid on the same host", () => {
		const sessionFile = join(tempDir, "g.jsonl");
		const lockPath = `${sessionFile}.lock`;
		// pid 0 is reserved on POSIX, kill(0, 0) is allowed but does not target a real process.
		// We use a high pid that is essentially guaranteed not to exist on this host.
		const stalePid = 2 ** 22 + 1; // Linux default pid_max is 32768; macOS up to ~99998. Past those.
		writeFileSync(
			lockPath,
			JSON.stringify({
				pid: stalePid,
				hostname: require("os").hostname(),
				openedAt: new Date().toISOString(),
			}),
		);

		const handle = acquireSessionLock(sessionFile);
		try {
			const info = JSON.parse(readFileSync(handle.lockPath, "utf8"));
			expect(info.pid).toBe(process.pid);
		} finally {
			handle.release();
		}
	});

	it("treats malformed lockfile as stale and reclaims it", () => {
		const sessionFile = join(tempDir, "h.jsonl");
		const lockPath = `${sessionFile}.lock`;
		writeFileSync(lockPath, "not json at all");

		const handle = acquireSessionLock(sessionFile);
		try {
			expect(existsSync(handle.lockPath)).toBe(true);
		} finally {
			handle.release();
		}
	});
});

describe("SessionManager file lock integration", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `session-manager-lock-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("acquires a lock when a fresh persistent session is created", () => {
		const manager = SessionManager.create(tempDir, tempDir);
		try {
			const sessionFile = manager.getSessionFile();
			expect(sessionFile).toBeDefined();
			expect(existsSync(`${sessionFile}.lock`)).toBe(true);
		} finally {
			manager.close();
		}
	});

	it("releases the lock when close() is called", () => {
		const manager = SessionManager.create(tempDir, tempDir);
		const sessionFile = manager.getSessionFile()!;
		expect(existsSync(`${sessionFile}.lock`)).toBe(true);
		manager.close();
		expect(existsSync(`${sessionFile}.lock`)).toBe(false);
	});

	it("does not lock when persist is disabled (in-memory mode)", () => {
		const manager = SessionManager.inMemory(tempDir);
		try {
			expect(manager.getSessionFile()).toBeUndefined();
		} finally {
			manager.close();
		}
	});

	it("rejects opening a session file already locked by another manager", () => {
		const first = SessionManager.create(tempDir, tempDir);
		const sessionFile = first.getSessionFile()!;

		// Force first manager to actually persist a header so the file exists on disk.
		// Without an assistant message _persist defers writes; we use _rewriteFile via a dummy
		// path-touch instead by writing a minimal valid header directly while the lock is held.
		// Simplest: just call SessionManager.open() on the file before the first manager has flushed
		// — the lock should still block it.
		try {
			// File may not exist yet (first manager hasn't flushed). Create a minimal valid header
			// so SessionManager.open can read it.
			writeFileSync(
				sessionFile,
				`${JSON.stringify({
					type: "session",
					version: 3,
					id: "test",
					timestamp: new Date().toISOString(),
					cwd: tempDir,
				})}\n`,
			);

			expect(() => SessionManager.open(sessionFile)).toThrow(SessionLockError);
		} finally {
			first.close();
		}
	});

	it("allows reopening a session file after the previous manager closes", () => {
		const first = SessionManager.create(tempDir, tempDir);
		const sessionFile = first.getSessionFile()!;
		writeFileSync(
			sessionFile,
			`${JSON.stringify({
				type: "session",
				version: 3,
				id: "test",
				timestamp: new Date().toISOString(),
				cwd: tempDir,
			})}\n`,
		);
		first.close();

		const second = SessionManager.open(sessionFile);
		try {
			expect(existsSync(`${sessionFile}.lock`)).toBe(true);
		} finally {
			second.close();
		}
	});

	it("keeps the source identity and lock when switching to a locked target fails", () => {
		const source = SessionManager.create(tempDir, tempDir);
		const target = SessionManager.create(tempDir, tempDir);
		const sourceFile = source.getSessionFile()!;
		const sourceId = source.getSessionId();
		const targetFile = target.getSessionFile()!;
		try {
			expect(() => source.setSessionFile(targetFile)).toThrow(SessionLockError);
			expect(source.getSessionFile()).toBe(sourceFile);
			expect(source.getSessionId()).toBe(sourceId);
			expect(existsSync(`${sourceFile}.lock`)).toBe(true);
			expect(existsSync(`${targetFile}.lock`)).toBe(true);
		} finally {
			source.close();
			target.close();
		}
	});
});
