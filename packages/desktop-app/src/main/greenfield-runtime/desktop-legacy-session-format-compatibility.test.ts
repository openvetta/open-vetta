import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDesktopLegacySessionFormatCompatibility } from "./desktop-legacy-session-format-compatibility.js";

const temporaryRoots = new Set<string>();

afterEach(() => {
	for (const root of temporaryRoots) rmSync(root, { force: true, recursive: true });
	temporaryRoots.clear();
});

describe("Desktop historical session format compatibility", () => {
	it("preserves discovery, history, rename, and delete behavior through the public facade", async () => {
		const directory = mkdtempSync(join(tmpdir(), "vetta-desktop-historical-session-"));
		temporaryRoots.add(directory);
		const sessionPath = join(directory, "historical.jsonl");
		writeFileSync(sessionPath, historicalSession(), "utf8");
		writeFileSync(`${sessionPath}.lock`, "stale lock", "utf8");

		const compatibility = createDesktopLegacySessionFormatCompatibility();
		expect(await compatibility.sessionCatalog.ownsSession(sessionPath)).toBe(true);
		expect(await compatibility.sessionCatalog.listSessions("C:\\workspace", directory)).toEqual([
			expect.objectContaining({
				id: "historical-session",
				firstMessage: "first prompt",
				lastMessagePreview: "final answer",
			}),
		]);
		expect(compatibility.sessionFileHistoryReader.read(sessionPath).history).toHaveLength(2);

		rmSync(`${sessionPath}.lock`);
		await compatibility.sessionCatalog.renameSession(sessionPath, "renamed session");
		expect(readFileSync(sessionPath, "utf8")).toContain('"name":"renamed session"');

		writeFileSync(`${sessionPath}.lock`, "stale lock", "utf8");
		await compatibility.sessionCatalog.deleteSessionArtifacts(sessionPath);
		expect(existsSync(sessionPath)).toBe(false);
		expect(existsSync(`${sessionPath}.lock`)).toBe(false);
	});
});

function historicalSession(): string {
	return `${[
		{
			type: "session",
			version: 3,
			id: "historical-session",
			timestamp: "2026-01-01T00:00:00.000Z",
			cwd: "C:\\workspace",
		},
		{
			type: "message",
			id: "user",
			parentId: null,
			timestamp: "2026-01-01T00:00:01.000Z",
			message: { role: "user", content: "first prompt", timestamp: 100 },
		},
		{
			type: "message",
			id: "assistant",
			parentId: "user",
			timestamp: "2026-01-01T00:00:02.000Z",
			message: { role: "assistant", content: "final answer", timestamp: 200 },
		},
	]
		.map((record) => JSON.stringify(record))
		.join("\n")}\n`;
}
