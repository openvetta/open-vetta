import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, AssistantMessage, Model, UserMessage } from "@vetta/ai";
import { afterEach, describe, expect, it } from "vitest";
import { AuthStorage } from "../../src/core/auth-storage.js";
import { ModelRegistry } from "../../src/core/model-registry.js";
import { SessionManager } from "../../src/core/session-manager/index.js";
import { SettingsManager } from "../../src/core/settings-manager.js";
import {
	CODING_AGENT_SDK_HOST_ERROR_CODES,
	CodingAgentSdkHostError,
	createGreenfieldAgentSession,
} from "../../src/host/coding-agent-sdk-host-adapter.js";
import type { GreenfieldSdkSession } from "../../src/public-api/sdk/index.js";

describe("Coding Agent SDK Host Adapter", () => {
	const temporaryDirectories: string[] = [];
	const sessions: GreenfieldSdkSession[] = [];

	afterEach(async () => {
		await Promise.all(sessions.splice(0).map((session) => session.close()));
		await Promise.all(
			temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
		);
	});

	it("creates an in-memory Greenfield session and closes the SDK result fields", async () => {
		const resources = await createResources("sdk-host-memory-");
		const legacySession = SessionManager.inMemory(resources.cwd);
		const result = await createGreenfieldAgentSession({
			...resources.options,
			sessionManager: legacySession,
			model: MODEL,
		});
		sessions.push(result.session);

		expect(result.session.sessionId).toBe(legacySession.getSessionId());
		expect(result.session.sessionFile).toBeUndefined();
		expect(result.extensionsResult.errors).toEqual([]);
		expect(result.modelFallbackMessage).toBeUndefined();
	});

	it("migrates a populated Legacy file snapshot without modifying the source", async () => {
		const resources = await createResources("sdk-host-legacy-");
		const legacyDirectory = await temporaryDirectory("sdk-host-legacy-sessions-");
		const legacySession = SessionManager.create(resources.cwd, legacyDirectory);
		legacySession.appendModelChange(MODEL.provider, MODEL.id);
		legacySession.appendThinkingLevelChange("high");
		legacySession.appendMessage(userMessage("Legacy question"));
		legacySession.appendMessage(assistantMessage("Legacy answer"));
		const sourcePath = legacySession.getSessionFile();
		if (!sourcePath) throw new Error("Expected a persisted Legacy session path");
		const sourceBefore = await readFile(sourcePath, "utf8");

		const result = await createGreenfieldAgentSession({
			...resources.options,
			sessionManager: legacySession,
			model: MODEL,
		});
		sessions.push(result.session);

		expect(result.session.sessionFile).not.toBe(sourcePath);
		expect(result.session.messages.map(({ role }) => role)).toEqual(["user", "assistant"]);
		expect(result.session.thinkingLevel).toBe("high");
		expect(await readFile(sourcePath, "utf8")).toBe(sourceBefore);
	});

	it("restores the SDK model fallback message while selecting an available replacement", async () => {
		const resources = await createResources("sdk-host-fallback-");
		registerTestModel(resources.modelRegistry);
		resources.settingsManager.setDefaultModelAndProvider(MODEL.provider, MODEL.id);
		const legacyDirectory = await temporaryDirectory("sdk-host-fallback-sessions-");
		const legacySession = SessionManager.create(resources.cwd, legacyDirectory);
		legacySession.appendModelChange("missing-provider", "missing-model");
		legacySession.appendMessage(userMessage("Restore this conversation"));
		legacySession.appendMessage(
			assistantMessage("Restored", {
				api: MODEL.api,
				provider: "missing-provider",
				id: "missing-model",
			}),
		);

		const result = await createGreenfieldAgentSession({
			...resources.options,
			sessionManager: legacySession,
		});
		sessions.push(result.session);

		expect(result.session.model).toMatchObject({ provider: MODEL.provider, id: MODEL.id });
		expect(result.modelFallbackMessage).toBe(
			`Could not restore model missing-provider/missing-model. Using ${MODEL.provider}/${MODEL.id}`,
		);
	});

	it("wires scoped models into initial selection and fixed-session cycling", async () => {
		const resources = await createResources("sdk-host-scoped-");
		registerTestModel(resources.modelRegistry);
		const result = await createGreenfieldAgentSession({
			...resources.options,
			scopedModels: [
				{ model: OTHER_MODEL, thinkingLevel: "high" },
				{ model: MODEL, thinkingLevel: "low" },
			],
		});
		sessions.push(result.session);

		expect(result.session.model).toMatchObject({ id: OTHER_MODEL.id });
		expect(result.session.scopedModels).toHaveLength(2);
		await expect(result.session.cycleModel()).resolves.toMatchObject({
			model: { id: MODEL.id },
			thinkingLevel: "low",
			isScoped: true,
		});
	});

	it("rejects options that still require the complete Legacy AgentSession facade", async () => {
		await expect(createGreenfieldAgentSession({ tools: [] })).rejects.toMatchObject({
			name: CodingAgentSdkHostError.name,
			code: CODING_AGENT_SDK_HOST_ERROR_CODES.INCOMPATIBLE_OPTIONS,
			issues: [{ option: "tools" }],
		});
	});

	async function createResources(prefix: string) {
		const cwd = await temporaryDirectory(`${prefix}cwd-`);
		const agentDir = await temporaryDirectory(`${prefix}agent-`);
		const authStorage = AuthStorage.inMemory();
		const modelRegistry = new ModelRegistry(authStorage, undefined);
		const settingsManager = SettingsManager.create(cwd, agentDir);
		return {
			cwd,
			agentDir,
			modelRegistry,
			settingsManager,
			options: {
				cwd,
				agentDir,
				authStorage,
				modelRegistry,
				settingsManager,
				enableMcp: false,
				enableSubagents: false,
				includeAgentSkills: false,
			},
		};
	}

	async function temporaryDirectory(prefix: string): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), prefix));
		temporaryDirectories.push(directory);
		return directory;
	}
});

function registerTestModel(modelRegistry: ModelRegistry): void {
	modelRegistry.registerProvider(MODEL.provider, {
		baseUrl: MODEL.baseUrl,
		apiKey: "sdk-test-key",
		api: MODEL.api,
		models: [
			{
				id: MODEL.id,
				name: MODEL.name,
				reasoning: MODEL.reasoning,
				input: [...MODEL.input],
				cost: MODEL.cost,
				contextWindow: MODEL.contextWindow,
				maxTokens: MODEL.maxTokens,
			},
			{
				id: OTHER_MODEL.id,
				name: OTHER_MODEL.name,
				reasoning: OTHER_MODEL.reasoning,
				input: [...OTHER_MODEL.input],
				cost: OTHER_MODEL.cost,
				contextWindow: OTHER_MODEL.contextWindow,
				maxTokens: OTHER_MODEL.maxTokens,
			},
		],
	});
}

function userMessage(text: string): UserMessage {
	return { role: "user", content: text, timestamp: 1 };
}

function assistantMessage(text: string, model: Pick<Model<Api>, "api" | "provider" | "id"> = MODEL): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: model.api,
		provider: model.provider,
		model: model.id,
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
	};
}

const MODEL: Model<Api> = {
	id: "sdk-host-model",
	name: "SDK Host Model",
	api: "openai-responses",
	provider: "sdk-host-provider",
	baseUrl: "https://example.test",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8_000,
	maxTokens: 1_000,
};

const OTHER_MODEL: Model<Api> = {
	...MODEL,
	id: "sdk-host-model-other",
	name: "SDK Host Model Other",
};
