import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "@sinclair/typebox";
import type { Api, AssistantMessage, Model, UserMessage } from "@vetta/ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthStorage } from "../../src/core/auth-storage.js";
import type { ToolDefinition } from "../../src/core/extensions/types.js";
import { ModelRegistry } from "../../src/core/model-registry.js";
import type { CreateAgentSessionOptions } from "../../src/core/sdk.js";
import { SessionManager } from "../../src/core/session-manager/index.js";
import { SettingsManager } from "../../src/core/settings-manager.js";
import { readTool } from "../../src/core/tools/index.js";
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

	it("preserves explicit built-in tool activation, including an empty tool list", async () => {
		const emptyResources = await createResources("sdk-host-no-tools-");
		const emptyResult = await createGreenfieldAgentSession({
			...emptyResources.options,
			model: MODEL,
			tools: [],
		});
		sessions.push(emptyResult.session);
		expect(emptyResult.session.getActiveToolNames()).toEqual([]);

		const subsetResources = await createResources("sdk-host-tool-subset-");
		const subsetResult = await createGreenfieldAgentSession({
			...subsetResources.options,
			model: MODEL,
			tools: [readTool],
		});
		sessions.push(subsetResult.session);
		expect(subsetResult.session.getActiveToolNames()).toEqual(["read"]);
	});

	it("registers, replaces and removes Session-private SDK custom tools", async () => {
		const resources = await createResources("sdk-host-custom-tools-");
		const result = await createGreenfieldAgentSession({
			...resources.options,
			model: MODEL,
			customTools: [customTool("before")],
		});
		sessions.push(result.session);

		expect(result.session.getAllTools().find(({ name }) => name === "sdk_echo")?.description).toBe("before");
		expect(result.session.getActiveToolNames()).toContain("sdk_echo");

		result.session.reconfigureCustomTools([customTool("after")]);
		expect(result.session.getAllTools().find(({ name }) => name === "sdk_echo")?.description).toBe("after");

		result.session.reconfigureCustomTools(undefined);
		expect(result.session.getAllTools().some(({ name }) => name === "sdk_echo")).toBe(false);
		expect(result.session.getActiveToolNames()).not.toContain("sdk_echo");
	});

	it("keeps SDK custom tools inactive when the caller supplied an explicit built-in tool list", async () => {
		const resources = await createResources("sdk-host-explicit-custom-tools-");
		const result = await createGreenfieldAgentSession({
			...resources.options,
			model: MODEL,
			tools: [],
			customTools: [customTool("inactive")],
		});
		sessions.push(result.session);

		expect(result.session.getAllTools().some(({ name }) => name === "sdk_echo")).toBe(true);
		expect(result.session.getActiveToolNames()).not.toContain("sdk_echo");
	});

	it("accepts tracing options without taking ownership of the injected tracer", async () => {
		const resources = await createResources("sdk-host-tracing-");
		const shutdown = vi.fn(async () => {});
		const tracer: NonNullable<CreateAgentSessionOptions["tracer"]> = {
			startObservation() {
				throw new Error("Session creation must not start a Turn observation");
			},
			shutdown,
		};
		const result = await createGreenfieldAgentSession({
			...resources.options,
			model: MODEL,
			tracer,
			tracingTraceName: "sdk-trace",
			tracingMetadata: { tenant: "test" },
		});
		sessions.push(result.session);

		await result.session.close();
		expect(shutdown).not.toHaveBeenCalled();
	});

	it("rejects options that still require the complete Legacy AgentSession facade", async () => {
		const subagentSessionFactory = {} as NonNullable<CreateAgentSessionOptions["subagentSessionFactory"]>;
		await expect(createGreenfieldAgentSession({ subagentSessionFactory })).rejects.toMatchObject({
			name: CodingAgentSdkHostError.name,
			code: CODING_AGENT_SDK_HOST_ERROR_CODES.INCOMPATIBLE_OPTIONS,
			issues: [{ option: "subagentSessionFactory" }],
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

function customTool(description: string): ToolDefinition {
	return {
		name: "sdk_echo",
		label: "SDK Echo",
		description,
		parameters: Type.Object({ value: Type.String() }),
		async execute(_toolCallId, params) {
			if (typeof params !== "object" || params === null || typeof Reflect.get(params, "value") !== "string") {
				throw new Error("Expected SDK echo input");
			}
			return { content: [{ type: "text", text: Reflect.get(params, "value") }], details: undefined };
		},
	};
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
