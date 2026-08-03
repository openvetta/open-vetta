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
import { createEmptySubagentTypeRegistry } from "../../src/core/subagents/index.js";
import { readTool } from "../../src/core/tools/index.js";
import { createGreenfieldAgentSession } from "../../src/host/coding-agent-sdk-host-adapter.js";
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

	it("keeps subagents fail-closed when enableSubagents is omitted", async () => {
		const resources = await createResources("sdk-host-subagents-default-");
		const result = await createGreenfieldAgentSession({
			...resources.options,
			enableSubagents: undefined,
			model: MODEL,
		});
		sessions.push(result.session);

		expect(result.session.getActiveToolNames()).not.toContain("spawn_agent");
		expect(result.session.listSubagents()).toEqual([]);
		expect(result.session.clearFinishedSubagents()).toBe(0);
	});

	it("accepts SDK subagent registry and factory injection without exposing Legacy objects", async () => {
		const resources = await createResources("sdk-host-subagent-injection-");
		const subagentTypeRegistry = createEmptySubagentTypeRegistry();
		const subagentSessionFactory: NonNullable<CreateAgentSessionOptions["subagentSessionFactory"]> = {
			async create() {
				throw new Error("Disabled subagents must not create a child");
			},
		};
		const result = await createGreenfieldAgentSession({
			...resources.options,
			model: MODEL,
			subagentTypeRegistry,
			subagentSessionFactory,
		});
		sessions.push(result.session);

		expect(result.session.listSubagents()).toEqual([]);
		expect(Reflect.has(result.session, "subagents")).toBe(false);
	});

	it("serves product behavior through narrow SDK capabilities", async () => {
		const resources = await createResources("sdk-host-product-capabilities-");
		registerTestModel(resources.modelRegistry);
		const memoryFile = join(resources.cwd, "MEMORY.md");
		const result = await createGreenfieldAgentSession({
			...resources.options,
			model: MODEL,
			memoryMode: true,
			memoryFile,
		});
		sessions.push(result.session);

		expect(await result.session.listAvailableModels()).toEqual(
			expect.arrayContaining([expect.objectContaining({ id: MODEL.id })]),
		);
		expect(result.session.getSystemPrompt()).not.toBe("");
		expect(result.session.getPromptTemplates()).toEqual([]);
		expect(result.session.listBackgroundTasks()).toEqual([]);
		expect(result.session.getTodos()).toEqual([]);
		expect(result.session.getMemoryConfiguration()).toEqual({ enabled: true, file: memoryFile, charLimit: 4_000 });
		await expect(result.session.flushMemory()).resolves.toBe(0);
		await expect(result.session.reconfigureAgentPlugins(undefined)).resolves.toBeUndefined();
		await expect(result.session.reloadMcp()).resolves.toBeUndefined();
		await expect(result.session.reload()).resolves.toBeUndefined();
		expect(result.session.hasExtensionHandlers("before_agent_start")).toBe(false);

		await result.session.recordBashResult("echo recorded", {
			output: "recorded",
			exitCode: 0,
			cancelled: false,
			truncated: false,
		});
		expect(result.session.getSessionBranch()).toContainEqual(
			expect.objectContaining({
				type: "message",
				message: expect.objectContaining({ role: "bashExecution", command: "echo recorded" }),
			}),
		);
		const outputPath = join(resources.cwd, "session.html");
		await expect(result.session.exportToHtml(outputPath)).resolves.toBe(outputPath);
		expect(await readFile(outputPath, "utf8")).toContain("<!DOCTYPE html>");
		for (const concrete of ["modelRegistry", "backgroundTasks", "todoStore", "resourceLoader", "extensionRunner"]) {
			expect(Reflect.has(result.session, concrete)).toBe(false);
		}
	});

	it("preserves SDK context and Extension bindings across active Session transitions", async () => {
		const resources = await createResources("sdk-host-active-session-");
		const result = await createGreenfieldAgentSession({
			...resources.options,
			model: MODEL,
		});
		sessions.push(result.session);
		const stableFacade = result.session;
		const initialPath = result.session.sessionFile;
		if (!initialPath) throw new Error("Expected a persisted SDK session");

		await result.session.sendCustomMessage({
			customType: "sdk-context",
			content: "host context",
			display: true,
		});
		const customEntry = result.session.getSessionBranch().find(({ type }) => type === "custom_message");
		if (!customEntry) throw new Error("Expected a custom context entry for active Session operations");
		await result.session.sendCustomMessage({
			customType: "sdk-context",
			content: "later context",
			display: true,
		});

		await expect(
			result.session.newSession({
				setup: async (sessionSetup) => {
					sessionSetup.appendMessage(userMessage("seeded setup"));
				},
			}),
		).resolves.toBe(true);
		expect(result.session).toBe(stableFacade);
		expect(result.session.messages).toEqual([expect.objectContaining({ role: "user" })]);
		await expect(result.session.switchSession(initialPath)).resolves.toBe(true);
		expect(result.session).toBe(stableFacade);
		expect(result.session.getSessionBranch()).toContainEqual(expect.objectContaining({ id: customEntry.id }));

		await expect(result.session.navigateTree(customEntry.id)).resolves.toMatchObject({
			cancelled: false,
			editorText: "host context",
		});
		result.session.abortBranchSummary();
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
