import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, Model } from "@vetta/ai";
import type { CodingAgentModelRegistrySource } from "@vetta/coding-agent/runtime-host/greenfield";
import { RuntimeHost } from "@vetta/runtime-core";
import { afterEach, describe, expect, it } from "vitest";
import { createGreenfieldRuntimeComposition } from "../src/greenfield-runtime-composition.js";
import { GreenfieldRuntimeHostSessionBackend } from "../src/greenfield-runtime-host-session-backend.js";

describe("GreenfieldRuntimeHostSessionBackend", () => {
	const directories: string[] = [];
	const disposers: Array<() => Promise<void>> = [];

	afterEach(async () => {
		for (const dispose of disposers.splice(0).reverse()) await dispose();
		for (const directory of directories.splice(0).reverse()) {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("maps supported RuntimeHost session options and resumes the persisted conversation", async () => {
		const cwd = await temporaryDirectory("greenfield-host-workspace-");
		const conversationDir = await temporaryDirectory("greenfield-host-conversations-");
		const composition = await createGreenfieldRuntimeComposition({
			conversationDir,
			cwd,
			scenario: "batch",
			enableSubagents: false,
			modelRegistry: modelRegistry(),
			initialModel: MODEL,
			initialThinkingLevel: "off",
		});
		const backend = new GreenfieldRuntimeHostSessionBackend({
			composition,
			conversationDir,
			cwd,
			scenario: "batch",
			enableSubagents: false,
		});
		const runtime = new RuntimeHost({ sessionBackend: backend });
		disposers.push(async () => {
			await runtime.disposeAllSessions();
			await composition.dispose();
		});

		const created = await runtime.createSession({
			cwd,
			sessionDir: conversationDir,
			scenario: "batch",
			model: SECOND_MODEL,
			thinkingLevel: "medium",
			executionMode: "full-access",
			enableBackgroundTasks: false,
			includeAgentSkills: false,
			appendSystemPrompt: "runtime-host-addon",
		});
		const createdSession = backend.readSession(created.sessionId);

		expect(createdSession).toBeDefined();
		expect(runtime.getState(created.sessionId)).toMatchObject({
			model: SECOND_MODEL,
			thinkingLevel: "medium",
			executionMode: "full-access",
			scenario: "batch",
		});
		expect(runtime.getState(created.sessionId).activeToolNames).not.toContain("task_output");
		expect(backend.readAssessment(created.sessionId)).toMatchObject({ ready: true });
		const sessionPath = runtime.getSessionPath(created.sessionId);
		expect(sessionPath).toBeDefined();
		await runtime.disposeSession(created.sessionId);
		expect(backend.readSession(created.sessionId)).toBeUndefined();

		const resumed = await runtime.createSession({
			cwd,
			sessionDir: conversationDir,
			sessionPath,
			scenario: "batch",
			executionMode: "full-access",
		});
		expect(resumed.sessionId).toBe(created.sessionId);

		const whitespacePath = await runtime.createSession({
			cwd,
			sessionDir: conversationDir,
			sessionPath: "   ",
			scenario: "batch",
		});
		expect(whitespacePath.sessionId).not.toBe(created.sessionId);
	});

	it("fails closed for composition and serverUrl mismatches", async () => {
		const cwd = await temporaryDirectory("greenfield-host-gate-workspace-");
		const conversationDir = await temporaryDirectory("greenfield-host-gate-conversations-");
		const composition = await createGreenfieldRuntimeComposition({
			conversationDir,
			cwd,
			scenario: "batch",
			enableSubagents: false,
			modelRegistry: modelRegistry(),
			initialModel: MODEL,
			initialThinkingLevel: "off",
		});
		const backend = new GreenfieldRuntimeHostSessionBackend({
			composition,
			conversationDir,
			cwd,
			scenario: "batch",
			enableSubagents: false,
			serverUrl: "https://expected.test",
		});
		const runtime = new RuntimeHost({
			sessionBackend: backend,
			serverUrl: "https://received.test",
		});
		disposers.push(async () => {
			await runtime.disposeAllSessions();
			await composition.dispose();
		});

		await expect(
			runtime.createSession({
				cwd: join(cwd, "other"),
				sessionDir: conversationDir,
				scenario: "batch",
			}),
		).rejects.toThrow("cwd mismatch");
		await expect(
			runtime.createSession({
				cwd,
				sessionDir: conversationDir,
				scenario: "batch",
			}),
		).rejects.toThrow("serverUrl");
	});

	async function temporaryDirectory(prefix: string): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), prefix));
		directories.push(directory);
		return directory;
	}
});

function modelRegistry(): CodingAgentModelRegistrySource {
	return {
		refresh() {},
		getAvailable: () => [MODEL, SECOND_MODEL],
		find: (provider, modelId) =>
			[MODEL, SECOND_MODEL].find((model) => model.provider === provider && model.id === modelId),
		getApiKey: async () => "test-key",
		setServerToken() {},
		loadRemoteModels: async () => undefined,
	};
}

const MODEL: Model<Api> = {
	id: "default-model",
	name: "Default Model",
	api: "openai-responses",
	provider: "test",
	baseUrl: "https://example.test",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8_000,
	maxTokens: 1_000,
};

const SECOND_MODEL: Model<Api> = {
	...MODEL,
	id: "session-model",
	name: "Session Model",
};
