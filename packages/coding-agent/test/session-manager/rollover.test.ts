import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionLockError } from "../../src/core/session-lock.js";
import { SessionManager } from "../../src/core/session-manager/index.js";
import { SessionStore } from "../../src/core/session-manager/session-store.js";
import { assistantMsg, userMsg } from "../utilities.js";

const managers: SessionManager[] = [];
const tempDirs: string[] = [];

afterEach(() => {
	vi.restoreAllMocks();
	for (const manager of managers.splice(0)) manager.close();
	for (const tempDir of tempDirs.splice(0)) {
		if (existsSync(tempDir)) rmSync(tempDir, { recursive: true });
	}
});

describe("SessionManager memory rollover", () => {
	it("prepares and locks the target before releasing the source identity", () => {
		const { manager, tempDir } = createCompactedSession();
		const sourceId = manager.getSessionId();
		const sourcePath = manager.getSessionFile();
		const sourceEntries = manager.getEntries();
		if (!sourcePath) throw new Error("Expected persisted source Session");

		const originalAcquire = SessionStore.prototype.acquireLockForCurrentFile;
		vi.spyOn(SessionStore.prototype, "acquireLockForCurrentFile").mockImplementation(function (this: SessionStore) {
			if (this.getSessionFile() !== sourcePath) throw new Error("target lock failed");
			return originalAcquire.call(this);
		});

		expect(() => manager.rolloverToNewFile()).toThrow("target lock failed");
		expect(manager.getSessionId()).toBe(sourceId);
		expect(manager.getSessionFile()).toBe(sourcePath);
		expect(manager.getEntries()).toEqual(sourceEntries);
		expect(() => SessionManager.open(sourcePath, tempDir)).toThrow(SessionLockError);
		expect(readdirSync(tempDir).filter((name) => name.endsWith(".jsonl"))).toEqual([basename(sourcePath)]);
	});

	it("commits the prepared target and transfers lock ownership once", () => {
		const { manager, tempDir } = createCompactedSession();
		const sourcePath = manager.getSessionFile();
		if (!sourcePath) throw new Error("Expected persisted source Session");

		const { from, to } = manager.rolloverToNewFile();
		if (!to) throw new Error("Expected rollover target");
		expect(from).toBe(sourcePath);
		expect(to).not.toBe(sourcePath);
		expect(manager.getSessionFile()).toBe(to);
		expect(() => SessionManager.open(to, tempDir)).toThrow(SessionLockError);

		const sourceReader = SessionManager.open(sourcePath, tempDir);
		sourceReader.close();
		manager.appendMessage(userMsg("continued on target"));
		manager.appendMessage(assistantMsg("target answer"));
		expect(manager.buildSessionContext().messages.at(-1)).toMatchObject({ role: "assistant" });
	});
});

function createCompactedSession(): { manager: SessionManager; tempDir: string } {
	const tempDir = join(tmpdir(), `vetta-rollover-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(tempDir, { recursive: true });
	tempDirs.push(tempDir);
	const manager = SessionManager.create(tempDir, tempDir);
	managers.push(manager);
	const firstKeptEntryId = manager.appendMessage(userMsg("kept turn"));
	manager.appendMessage(assistantMsg("kept answer"));
	manager.appendCompaction("summary", firstKeptEntryId, 1_000);
	return { manager, tempDir };
}
