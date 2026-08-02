import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeHostSessionAssembly, RuntimeSessionCreateRequest } from "@vetta/runtime-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	DesktopLegacySessionCompatibilityError,
	DesktopLegacySessionMigrationBackend,
} from "./desktop-legacy-session-migration-backend.js";

const temporaryRoots = new Set<string>();

afterEach(async () => {
	await Promise.all([...temporaryRoots].map((root) => rm(root, { force: true, recursive: true })));
	temporaryRoots.clear();
});

describe("Desktop Legacy session migration backend", () => {
	it("migrates a supported Legacy session before delegating to Greenfield", async () => {
		const fixture = await createFixture(legacySession("hello"));
		const sourceContent = await readFile(fixture.sourcePath, "utf8");
		const assembly = {} as RuntimeHostSessionAssembly;
		const createAssembly = vi.fn<(request: RuntimeSessionCreateRequest) => Promise<RuntimeHostSessionAssembly>>();
		createAssembly.mockResolvedValue(assembly);
		const backend = new DesktopLegacySessionMigrationBackend({ createAssembly });

		await expect(backend.createAssembly(createRequest(fixture.sourcePath, fixture.targetRootDir))).resolves.toBe(
			assembly,
		);
		expect(createAssembly).toHaveBeenCalledWith(
			expect.objectContaining({
				sessionDir: fixture.targetRootDir,
				sessionPath: expect.stringMatching(/\.conversation\.jsonl$/),
			}),
		);
		expect(await readFile(fixture.sourcePath, "utf8")).toBe(sourceContent);
	});

	it("rejects incompatible content without invoking Greenfield or creating a target", async () => {
		const fixture = await createFixture(
			jsonLines([
				header(4),
				{
					type: "future_entry",
					id: "future-1",
					parentId: null,
					timestamp: "2026-01-01T00:00:01.000Z",
				},
			]),
		);
		const createAssembly = vi.fn<(request: RuntimeSessionCreateRequest) => Promise<RuntimeHostSessionAssembly>>();
		const backend = new DesktopLegacySessionMigrationBackend({ createAssembly });

		await expect(
			backend.createAssembly(createRequest(fixture.sourcePath, fixture.targetRootDir)),
		).rejects.toMatchObject({
			name: "DesktopLegacySessionCompatibilityError",
			incompatibility: {
				errorCode: "session_version_unsupported",
				sourceVersion: 4,
			},
		});
		expect(createAssembly).not.toHaveBeenCalled();
		await expect(readFile(fixture.targetRootDir)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("exposes a typed compatibility error", () => {
		const error = new DesktopLegacySessionCompatibilityError({
			kind: "session-incompatible",
			status: "not-representable",
			sourcePath: "C:/sessions/future.jsonl",
			errorCode: "session_version_unsupported",
			sourceVersion: 4,
		});

		expect(error.message).toContain("session_version_unsupported");
	});
});

async function createFixture(content: string): Promise<{ sourcePath: string; targetRootDir: string }> {
	const root = await mkdtemp(join(tmpdir(), "vetta-desktop-legacy-migration-"));
	temporaryRoots.add(root);
	const sourcePath = join(root, "legacy.jsonl");
	const targetRootDir = join(root, "conversations");
	await writeFile(sourcePath, content, "utf8");
	return { sourcePath, targetRootDir };
}

function createRequest(sourcePath: string, sessionDir: string): RuntimeSessionCreateRequest {
	return {
		sessionPath: sourcePath,
		sessionDir,
		executionMode: "full-access",
		enableSubagents: false,
		getSessionId: () => undefined,
	};
}

function legacySession(content: string): string {
	return jsonLines([
		header(3),
		{
			type: "message",
			id: "user-1",
			parentId: null,
			timestamp: "2026-01-01T00:00:01.000Z",
			message: { role: "user", content, timestamp: 1 },
		},
	]);
}

function header(version: number) {
	return {
		type: "session",
		version,
		id: "legacy-source",
		timestamp: "2026-01-01T00:00:00.000Z",
		cwd: "C:/legacy-workspace",
	};
}

function jsonLines(records: readonly unknown[]): string {
	return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}
