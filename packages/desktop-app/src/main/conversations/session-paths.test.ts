import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readDesktopSessionHeader } from "./session-paths.js";

describe("readDesktopSessionHeader", () => {
	const directories: string[] = [];

	afterEach(async () => {
		for (const directory of directories.splice(0).reverse()) {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("reads both Legacy and Greenfield cwd headers", async () => {
		const directory = await temporaryDirectory("desktop-session-header-");
		const cwd = join(directory, "workspace");
		const legacyPath = join(directory, "legacy.jsonl");
		const greenfieldPath = join(directory, "greenfield.conversation.jsonl");
		await writeFile(legacyPath, `${JSON.stringify({ type: "session", cwd })}\n`, "utf8");
		await writeFile(
			greenfieldPath,
			`${JSON.stringify({
				recordType: "conversation.header",
				schemaVersion: 2,
				sessionId: "greenfield-session",
				createdAt: Date.now(),
				cwd,
			})}\n`,
			"utf8",
		);

		await expect(readDesktopSessionHeader(legacyPath)).resolves.toEqual({ type: "session", cwd });
		await expect(readDesktopSessionHeader(greenfieldPath)).resolves.toEqual({ type: "session", cwd });
	});

	it("rejects unsupported or relative cwd headers", async () => {
		const directory = await temporaryDirectory("desktop-invalid-session-header-");
		const unsupportedPath = join(directory, "unsupported.jsonl");
		const relativePath = join(directory, "relative.conversation.jsonl");
		await writeFile(unsupportedPath, `${JSON.stringify({ recordType: "other", cwd: directory })}\n`, "utf8");
		await writeFile(
			relativePath,
			`${JSON.stringify({
				recordType: "conversation.header",
				schemaVersion: 2,
				sessionId: "relative-session",
				createdAt: Date.now(),
				cwd: "relative",
			})}\n`,
			"utf8",
		);

		await expect(readDesktopSessionHeader(unsupportedPath)).resolves.toBeUndefined();
		await expect(readDesktopSessionHeader(relativePath)).resolves.toBeUndefined();
	});

	async function temporaryDirectory(prefix: string): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), prefix));
		directories.push(directory);
		return directory;
	}
});
