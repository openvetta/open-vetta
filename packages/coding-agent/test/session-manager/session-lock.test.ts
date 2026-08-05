import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acquireSessionLock, SessionLockError } from "../../src/core/session-lock.js";

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
