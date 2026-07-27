import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelRegistry } from "@vetta/coding-agent";
import { SessionManager } from "@vetta/coding-agent";
import { describe, expect, it, vi } from "vitest";
import {
	LegacyRuntimeSessionCatalog,
	LegacyRuntimeSessionFileHistoryReader,
	LegacyRuntimeSharedModelController,
	RuntimeHost,
	type RuntimeSessionCatalog,
	type RuntimeSessionFileHistoryReader,
} from "../../src/index.js";

describe("runtime host process services", () => {
	it("delegates shared model auth refresh and background refresh", async () => {
		const setServerToken = vi.fn();
		const loadRemoteModels = vi.fn(async () => {});
		const registry = { setServerToken, loadRemoteModels } as unknown as ModelRegistry;
		const controller = new LegacyRuntimeSharedModelController(registry);

		await controller.refreshAuth("token");
		controller.refreshInBackground();

		expect(setServerToken).toHaveBeenCalledWith("token");
		expect(loadRemoteModels).toHaveBeenCalledTimes(2);
	});

	it("delegates offline catalog and direct file history operations", async () => {
		const projects = [{ cwd: "C:/workspace", sessionCount: 2 }];
		const sessions = [
			{
				id: "session-1",
				path: "C:/sessions/one.jsonl",
				cwd: "C:/workspace",
				firstMessage: "hello",
				modifiedAt: 1,
			},
		];
		const history = [
			{ type: "message" as const, message: { role: "user" as const, content: "hello", timestamp: 1 } },
		];
		const listProjects = vi.fn(async () => projects);
		const listSessions = vi.fn(async () => sessions);
		const renameSession = vi.fn(async () => {});
		const deleteSessionArtifacts = vi.fn(async () => {});
		const read = vi.fn(() => ({ history }));
		const sessionCatalog: RuntimeSessionCatalog = {
			listProjects,
			listSessions,
			renameSession,
			deleteSessionArtifacts,
		};
		const sessionFileHistoryReader: RuntimeSessionFileHistoryReader = { read };
		const host = new RuntimeHost({ sessionCatalog, sessionFileHistoryReader });

		expect(await host.listProjects()).toEqual(projects);
		expect(await host.listSessions("C:/workspace", "C:/sessions")).toEqual(sessions);
		expect(host.readSessionHistoryFromFile("C:/sessions/one.jsonl")).toEqual({ history });
		await host.renameSession("C:/sessions/one.jsonl", "renamed");
		await host.deleteSession("C:/sessions/one.jsonl");

		expect(listSessions).toHaveBeenCalledWith("C:/workspace", "C:/sessions");
		expect(read).toHaveBeenCalledWith("C:/sessions/one.jsonl");
		expect(renameSession).toHaveBeenCalledWith("C:/sessions/one.jsonl", "renamed");
		expect(deleteSessionArtifacts).toHaveBeenCalledWith("C:/sessions/one.jsonl");
	});

	it("preserves legacy JSONL listing, history, rename and deletion behavior", async () => {
		const root = await mkdtemp(join(tmpdir(), "vetta-runtime-core-"));
		const sessionDir = join(root, "sessions");
		let sessionPath: string | undefined;
		try {
			const manager = SessionManager.create(root, sessionDir);
			manager.appendMessage({ role: "user", content: "hello", timestamp: 1 });
			manager.appendMessage({
				role: "assistant",
				content: [{ type: "text", text: "world" }],
				api: "openai-responses",
				provider: "openai",
				model: "test-model",
				usage: {
					input: 1,
					output: 1,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 2,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop",
				timestamp: 2,
			});
			sessionPath = manager.getSessionFile();
			manager.close();
			if (!sessionPath) throw new Error("Expected a persisted session path");

			const catalog = new LegacyRuntimeSessionCatalog();
			const historyReader = new LegacyRuntimeSessionFileHistoryReader();
			const listed = await catalog.listSessions(root, sessionDir);
			expect(listed).toHaveLength(1);
			expect(listed[0]).toMatchObject({ path: sessionPath, cwd: root, firstMessage: "hello" });
			expect(historyReader.read(sessionPath).history).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						type: "message",
						message: expect.objectContaining({ role: "user", content: "hello" }),
					}),
				]),
			);

			await catalog.renameSession(sessionPath, "renamed");
			expect((await catalog.listSessions(root, sessionDir))[0]?.name).toBe("renamed");
			await catalog.deleteSessionArtifacts(sessionPath);
			expect(existsSync(sessionPath)).toBe(false);
			expect(existsSync(`${sessionPath}.lock`)).toBe(false);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
