import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLegacySessionFormatLease } from "@vetta/coding-agent/runtime-host";
import { afterEach, describe, expect, it } from "vitest";
import { migrateGreenfieldImLegacySession } from "../src/rpc/greenfield-im-legacy-session-migration.js";

const temporaryRoots = new Set<string>();

afterEach(async () => {
	await Promise.all([...temporaryRoots].map((root) => rm(root, { force: true, recursive: true })));
	temporaryRoots.clear();
});

describe("Greenfield IM Legacy session migration", () => {
	it("migrates without changing the source and reuses an identical target", async () => {
		const fixture = await createFixture(legacySession("hello"));
		const sourceContent = await readFile(fixture.sourcePath, "utf8");

		const migrated = await migrateGreenfieldImLegacySession(fixture.sourcePath, fixture.targetRootDir);
		const reused = await migrateGreenfieldImLegacySession(fixture.sourcePath, fixture.targetRootDir);

		expect(migrated).toMatchObject({ kind: "greenfield", status: "migrated" });
		expect(reused).toEqual({ ...migrated, status: "reused" });
		expect(await readFile(fixture.sourcePath, "utf8")).toBe(sourceContent);
	});

	it("creates a new deterministic target when the source content changes", async () => {
		const fixture = await createFixture(legacySession("before"));
		const before = await migrateGreenfieldImLegacySession(fixture.sourcePath, fixture.targetRootDir);
		await writeFile(fixture.sourcePath, legacySession("after"), "utf8");

		const after = await migrateGreenfieldImLegacySession(fixture.sourcePath, fixture.targetRootDir);

		expect(before).toMatchObject({ kind: "greenfield", status: "migrated" });
		expect(after).toMatchObject({ kind: "greenfield", status: "migrated" });
		if (before.kind !== "greenfield" || after.kind !== "greenfield") throw new Error("Expected migrations");
		expect(after.targetPath).not.toBe(before.targetPath);
	});

	it("falls back while another Legacy owner holds the source lock", async () => {
		const fixture = await createFixture(legacySession("locked"));
		const held = acquireLegacySessionFormatLease(fixture.sourcePath);
		if (held.kind !== "acquired") throw new Error("Expected test lease");

		try {
			await expect(
				migrateGreenfieldImLegacySession(fixture.sourcePath, fixture.targetRootDir),
			).resolves.toMatchObject({
				kind: "legacy-fallback",
				status: "locked",
			});
		} finally {
			held.lease.release();
		}
	});

	it("falls back when the Legacy document cannot be represented by V2", async () => {
		const fixture = await createFixture(
			legacyJsonLines([
				legacyHeader(),
				{
					type: "message",
					id: "unsupported",
					parentId: null,
					timestamp: "2026-01-01T00:00:01.000Z",
					message: { role: "assistant", content: "unsupported", timestamp: 1 },
				},
			]),
		);

		await expect(migrateGreenfieldImLegacySession(fixture.sourcePath, fixture.targetRootDir)).resolves.toMatchObject({
			kind: "legacy-fallback",
			status: "not-representable",
			errorCode: "conversation_corrupt",
			issueCode: "invalid-payload",
			issueCount: 1,
		});
	});

	it("reports strict import issues without exposing source content", async () => {
		const fixture = await createFixture(
			`${JSON.stringify(legacyHeader())}\n${JSON.stringify({
				type: "future_entry",
				id: "future-1",
				parentId: null,
				timestamp: "2026-01-01T00:00:01.000Z",
				secret: "must-not-leak",
			})}\n{broken}\n`,
		);

		const result = await migrateGreenfieldImLegacySession(fixture.sourcePath, fixture.targetRootDir);

		expect(result).toMatchObject({
			kind: "legacy-fallback",
			status: "not-representable",
			issueCode: "malformed-json",
			issueCount: 2,
		});
		expect(JSON.stringify(result)).not.toContain("must-not-leak");
	});
});

async function createFixture(content: string): Promise<{ sourcePath: string; targetRootDir: string }> {
	const root = await mkdtemp(join(tmpdir(), "vetta-greenfield-legacy-migration-"));
	temporaryRoots.add(root);
	const sourcePath = join(root, "legacy.jsonl");
	const targetRootDir = join(root, "conversations");
	await writeFile(sourcePath, content, "utf8");
	return { sourcePath, targetRootDir };
}

function legacySession(content: string): string {
	return legacyJsonLines([
		legacyHeader(),
		{
			type: "message",
			id: "user-1",
			parentId: null,
			timestamp: "2026-01-01T00:00:01.000Z",
			message: { role: "user", content, timestamp: 1 },
		},
	]);
}

function legacyHeader() {
	return {
		type: "session",
		version: 3,
		id: "legacy-source",
		timestamp: "2026-01-01T00:00:00.000Z",
		cwd: "C:/legacy-workspace",
	};
}

function legacyJsonLines(records: readonly unknown[]): string {
	return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}
