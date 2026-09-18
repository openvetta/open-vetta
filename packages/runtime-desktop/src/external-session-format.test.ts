import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDesktopExternalSessionFormat } from "./external-session-format.js";

const temporaryRoots = new Set<string>();

afterEach(() => {
	for (const root of temporaryRoots) rmSync(root, { force: true, recursive: true });
	temporaryRoots.clear();
});

describe("Desktop external session format", () => {
	it("lists Grok sidecars through the public facade without writing back", async () => {
		const root = mkdtempSync(join(tmpdir(), "vetta-desktop-external-session-"));
		temporaryRoots.add(root);
		const sidecarPath = writeSidecar(root);
		const format = createDesktopExternalSessionFormat({
			resolveSessionsDirectory: () => root,
			now: () => Date.parse("2026-09-18T00:00:00.000Z"),
		});

		expect(await format.sessionCatalog.ownsSession(sidecarPath)).toBe(true);
		expect(await format.sessionCatalog.listSessions(root)).toEqual([
			expect.objectContaining({
				id: "desktop-grok",
				origin: { tool: "grok", path: sidecarPath },
			}),
		]);
		expect(await format.sessionCatalog.listProjects()).toEqual([]);
		await expect(format.sessionCatalog.renameSession(sidecarPath, "nope")).rejects.toThrow(/read-only/i);
		expect(format.sessionFileHistoryReader.canRead(sidecarPath)).toBe(true);
		expect(format.sessionFileHistoryReader.read(sidecarPath).history).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "message",
					message: expect.objectContaining({ role: "user", content: "Read-only preview." }),
				}),
			]),
		);
	});
});

function writeSidecar(root: string): string {
	const sessionDir = join(root, "demo", "session");
	mkdirSync(sessionDir, { recursive: true });
	const sidecarPath = join(sessionDir, "summary.json");
	writeFileSync(
		sidecarPath,
		`${JSON.stringify(
			{
				info: { id: "desktop-grok", cwd: "/workspace/demo" },
				chat_format_version: 1,
				generated_title: "Desktop grok",
				git_root_dir: "/workspace/demo",
				last_active_at: "2026-09-10T00:00:00.000Z",
			},
			null,
			2,
		)}\n`,
	);
	writeFileSync(
		join(sessionDir, "chat_history.jsonl"),
		`${JSON.stringify({
			type: "user",
			prompt_index: 0,
			content: [{ type: "text", text: "<user_query>\nRead-only preview.\n</user_query>" }],
		})}\n`,
	);
	return sidecarPath;
}
