import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, Model } from "@vetta/ai";
import type { CodingAgentModelRegistrySource } from "@vetta/coding-agent/runtime-host/greenfield";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createDesktopGreenfieldRuntimeCandidate,
	type DesktopGreenfieldRuntimeCandidate,
} from "./desktop-greenfield-runtime-candidate.js";

describe("DesktopGreenfieldRuntimeCandidate", () => {
	const directories: string[] = [];
	const candidates: DesktopGreenfieldRuntimeCandidate[] = [];

	afterEach(async () => {
		for (const candidate of candidates.splice(0).reverse()) await candidate.dispose();
		for (const directory of directories.splice(0).reverse()) {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("creates and resumes a complete candidate through the real RuntimeHost", async () => {
		const cwd = await temporaryDirectory("desktop-greenfield-workspace-");
		const conversationDir = await temporaryDirectory("desktop-greenfield-conversations-");
		const candidate = await createDesktopGreenfieldRuntimeCandidate(
			{
				conversationDir,
				cwd,
				modelRegistry: modelRegistry(),
				initialModel: MODEL,
				initialThinkingLevel: "off",
			},
			{
				serverUrl: "https://server.test",
				userQuestionHandler: async () => ({ cancelled: true, answers: [] }),
				invokePluginTool: vi.fn(async () => ({ value: undefined, effects: [] })),
				invokePluginContinuation: vi.fn(async () => ({ value: null, effects: [] })),
				invokePluginSystemPrompt: vi.fn(async () => []),
			},
		);
		candidates.push(candidate);

		const created = await candidate.createSession({
			cwd,
			model: SECOND_MODEL,
			thinkingLevel: "medium",
			agentMode: "work",
			enableBackgroundTasks: false,
			includeAgentSkills: false,
			askUserQuestion: true,
			enableAgentPlugins: true,
			agentPlugins: {},
		});

		expect(created.assessment).toMatchObject({ ready: true });
		expect(created.session.readState()).toMatchObject({
			model: SECOND_MODEL,
			thinkingLevel: "medium",
		});
		expect(created.session.readState().activeToolNames).not.toContain("task_output");
		expect(created.session.readState().activeToolNames).toContain("ask_user_question");
		const sessionPath = created.session.createCoreAssembly().lifecycle.sessionPath;
		if (!sessionPath) throw new Error("Greenfield candidate did not expose a session path");
		await candidate.disposeSession(created.session.sessionId);

		const resumed = await candidate.resumeSession(sessionPath, { cwd });
		expect(resumed.assessment).toMatchObject({ ready: true });
		expect(resumed.session.sessionId).toBe(created.session.sessionId);
	});

	it("rejects workspace mismatches and session files not owned by the Greenfield catalog", async () => {
		const cwd = await temporaryDirectory("desktop-greenfield-gate-workspace-");
		const conversationDir = await temporaryDirectory("desktop-greenfield-gate-conversations-");
		const candidate = await createDesktopGreenfieldRuntimeCandidate({
			conversationDir,
			cwd,
			modelRegistry: modelRegistry(),
			initialModel: MODEL,
			initialThinkingLevel: "off",
		});
		candidates.push(candidate);

		await expect(candidate.createSession({ cwd: join(cwd, "other") })).rejects.toThrow(
			"workspace-scoped composition",
		);
		await expect(candidate.resumeSession(join(conversationDir, "legacy.jsonl"))).rejects.toThrow(
			"No RuntimeHost session backend owns",
		);
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
	id: "desktop-session-model",
	name: "Desktop Session Model",
};
