import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, Model } from "@vetta/ai";
import { ALL_SCENARIOS, AuthStorage, ModelRegistry } from "@vetta/coding-agent";
import { createLegacyRuntimeHostOptions } from "@vetta/coding-agent/runtime-host";
import type { CodingAgentModelRegistrySource } from "@vetta/coding-agent/runtime-host/greenfield";
import { type AgentPluginRuntimeConfig, type ConversationScenario, RuntimeHost } from "@vetta/runtime-core";
import { afterEach, describe, expect, it } from "vitest";
import {
	type OpenAiResponsesTestServer,
	type ProviderRequest,
	startOpenAiResponsesTestServer,
	textResponseEvents,
} from "../../../../cli-app/test/support/openai-responses-test-server.js";
import { DesktopGreenfieldRuntimeBackendPool } from "./desktop-greenfield-runtime-backend-pool.js";

type RuntimeBackend = "legacy" | "greenfield";

interface RuntimeFixture {
	readonly runtime: RuntimeHost;
	readonly dispose: () => Promise<void>;
}

interface ModelCallObservation {
	readonly body: Readonly<Record<string, unknown>>;
}

describe("Desktop RuntimeHost model-call frame cutover readiness", () => {
	const directories: string[] = [];
	const fixtures: RuntimeFixture[] = [];
	const servers: OpenAiResponsesTestServer[] = [];

	afterEach(async () => {
		for (const fixture of fixtures.splice(0).reverse()) await fixture.dispose();
		for (const server of servers.splice(0).reverse()) await server.dispose();
		for (const directory of directories.splice(0).reverse()) {
			await rm(directory, { recursive: true, force: true });
		}
	});

	for (const scenario of ALL_SCENARIOS) {
		it(`preserves the exact ${scenario} model-call frame contract`, async () => {
			const cwd = await temporaryDirectory(`desktop-frame-${scenario}-workspace-`);
			const observations = await observeBackends(cwd, scenario);

			assertSharedModelCallFrame(observations.greenfield, observations.legacy);
		}, 30_000);
	}

	it("applies host capability changes at the same turn boundary across backends", async () => {
		const cwd = await temporaryDirectory("desktop-frame-dynamic-workspace-");
		const observations: Record<RuntimeBackend, readonly ModelCallObservation[]> = {
			legacy: [],
			greenfield: [],
		};

		for (const backend of RUNTIME_BACKENDS) {
			const server = await createServer();
			const model = { ...MODEL, baseUrl: server.baseUrl };
			const agentStateDir = await temporaryDirectory(`desktop-frame-${backend}-dynamic-agent-`);
			const sessionDir = await temporaryDirectory(`desktop-frame-${backend}-dynamic-sessions-`);
			const fixture = createRuntimeFixture(backend, agentStateDir, model);
			fixtures.push(fixture);
			fixture.runtime.setUserQuestionHandler(async () => ({ cancelled: true, answers: [] }));
			fixture.runtime.setPluginToolInvoker(async () => ({ value: { text: "unused" }, effects: [] }));
			fixture.runtime.setPluginSystemPromptInvoker(async () => [
				{
					type: "addBlock",
					block: {
						id: "plugin.model-call-frame",
						type: "plugin",
						source: { kind: "plugin" },
						content: "Model-call frame plugin instruction",
						priority: 700,
						enabled: true,
					},
				},
			]);

			const created = await fixture.runtime.createSession({
				cwd,
				agentDir: agentStateDir,
				sessionDir,
				model,
				thinkingLevel: "off",
				scenario: "conversation",
				agentMode: "work",
				executionMode: "full-access",
				enableBackgroundTasks: true,
				includeAgentSkills: false,
				askUserQuestion: true,
				enableAgentPlugins: true,
				agentPlugins: pluginConfiguration(),
				appendSystemPrompt: "Model-call frame host instruction",
			});
			await fixture.runtime.prompt(created.sessionId, { text: "Inspect the active capabilities" });
			const firstFrame = observeRequest(server, 0);

			fixture.runtime.reconfigureAgentPlugins(undefined);
			fixture.runtime.setGlobalAgentMode("coding");
			fixture.runtime.setUserQuestionHandler(undefined);
			await fixture.runtime.prompt(created.sessionId, {
				text: "Inspect the capabilities after reconfiguration",
				metadata: { knowledgeMode: true },
			});
			const secondFrame = observeRequest(server, 1);
			observations[backend] = [firstFrame, secondFrame];
		}

		const [legacyBefore, legacyAfter] = observations.legacy;
		const [greenfieldBefore, greenfieldAfter] = observations.greenfield;
		if (!legacyBefore || !legacyAfter || !greenfieldBefore || !greenfieldAfter) {
			throw new Error("Expected two model-call observations per backend");
		}
		assertSharedModelCallFrame(greenfieldBefore, legacyBefore);
		assertSharedModelCallFrame(greenfieldAfter, legacyAfter);
		for (const before of [legacyBefore, greenfieldBefore]) {
			const names = toolNames(before.body.tools);
			expect(names).toContain("plugin_model_call_frame");
			expect(names).toContain("ask_user_question");
			expect(JSON.stringify(before.body.input)).toContain("Model-call frame plugin instruction");
		}
		for (const after of [legacyAfter, greenfieldAfter]) {
			const names = toolNames(after.body.tools);
			expect(names).not.toContain("plugin_model_call_frame");
			expect(names).not.toContain("ask_user_question");
			expect(JSON.stringify(after.body.input)).not.toContain("Model-call frame plugin instruction");
		}
		expect(sharedProviderBody(legacyAfter.body)).not.toEqual(sharedProviderBody(legacyBefore.body));
		expect(sharedProviderBody(greenfieldAfter.body)).not.toEqual(sharedProviderBody(greenfieldBefore.body));
	}, 30_000);

	async function observeBackends(
		cwd: string,
		scenario: ConversationScenario,
	): Promise<Record<RuntimeBackend, ModelCallObservation>> {
		const observations = {} as Record<RuntimeBackend, ModelCallObservation>;
		for (const backend of RUNTIME_BACKENDS) {
			const server = await createServer();
			const model = { ...MODEL, baseUrl: server.baseUrl };
			const agentStateDir = await temporaryDirectory(`desktop-frame-${backend}-${scenario}-agent-`);
			const sessionDir = await temporaryDirectory(`desktop-frame-${backend}-${scenario}-sessions-`);
			const fixture = createRuntimeFixture(backend, agentStateDir, model);
			fixtures.push(fixture);
			const created = await fixture.runtime.createSession({
				cwd,
				agentDir: agentStateDir,
				sessionDir,
				model,
				thinkingLevel: "off",
				scenario,
				executionMode: "full-access",
				enableBackgroundTasks: false,
				includeAgentSkills: false,
			});

			await fixture.runtime.prompt(created.sessionId, { text: `Observe the ${scenario} model-call frame` });
			observations[backend] = observeRequest(server, 0);
		}
		return observations;
	}

	async function createServer(): Promise<OpenAiResponsesTestServer> {
		const server = await startOpenAiResponsesTestServer(() => ({
			kind: "events",
			events: textResponseEvents("Model-call frame captured"),
		}));
		servers.push(server);
		return server;
	}

	async function temporaryDirectory(prefix: string): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), prefix));
		directories.push(directory);
		return directory;
	}
});

function observeRequest(server: OpenAiResponsesTestServer, requestIndex: number): ModelCallObservation {
	const request = server.requests[requestIndex];
	if (!request) throw new Error(`Missing Provider request at index ${requestIndex}`);
	return { body: observableProviderBody(request.body) };
}

function observableProviderBody(body: ProviderRequest): Readonly<Record<string, unknown>> {
	const observation: Record<string, unknown> = { ...body };
	delete observation.prompt_cache_key;
	return observation;
}

function assertSharedModelCallFrame(greenfield: ModelCallObservation, legacy: ModelCallObservation): void {
	expect(sharedProviderBody(greenfield.body)).toEqual(sharedProviderBody(legacy.body));
	expect(greenfield.body.tools).toEqual(legacy.body.tools);
}

function sharedProviderBody(body: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
	const shared = { ...body };
	delete shared.tools;
	shared.input = normalizeModelVisibleValue(shared.input);
	return shared;
}

function normalizeModelVisibleValue(value: unknown): unknown {
	if (typeof value === "string") return normalizeSystemPrompt(value);
	if (Array.isArray(value)) return value.map(normalizeModelVisibleValue);
	if (!isRecord(value)) return value;
	return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizeModelVisibleValue(entry)]));
}

function normalizeSystemPrompt(value: string): string {
	return value
		.replace(/Available tools:\n[\s\S]*?\n\nGuidelines:/g, "Available tools:\n<tool-surface>\n\nGuidelines:")
		.replace(
			/<available_skills>[\s\S]*?<\/available_skills>/g,
			"<available_skills>\n<skill-surface>\n</available_skills>",
		)
		.replace(/^Current date and time: .*$/gm, "Current date and time: <turn-time>");
}

function toolNames(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((tool) => {
		if (!isRecord(tool) || typeof tool.name !== "string") return [];
		return [tool.name];
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function pluginConfiguration(): AgentPluginRuntimeConfig {
	return {
		systemPromptProviderContributions: [
			{
				pluginId: "model-call-frame",
				id: "model-call-frame-prompt",
				handlerId: "model-call-frame-prompt-handler",
				context: { conversation: "messages", systemPrompt: "rendered" },
			},
		],
		toolContributions: [
			{
				pluginId: "model-call-frame",
				id: "model-call-frame-tool",
				name: "plugin_model_call_frame",
				description: "Observe the plugin tool frame",
				parameters: { type: "object", properties: {}, additionalProperties: false },
				handlerId: "model-call-frame-tool-handler",
				scope_use: ["conversation"],
			},
		],
	};
}

function createRuntimeFixture(backend: RuntimeBackend, agentStateDir: string, model: Model<Api>): RuntimeFixture {
	if (backend === "legacy") {
		const authStorage = AuthStorage.create(join(agentStateDir, "auth.json"));
		authStorage.setRuntimeApiKey(model.provider, "test-key");
		const registry = new ModelRegistry(authStorage, join(agentStateDir, "models.json"));
		const runtime = new RuntimeHost(
			createLegacyRuntimeHostOptions({
				getDefaultExecutionMode: () => "full-access",
				modelRegistry: registry,
			}),
		);
		return { runtime, dispose: () => runtime.disposeAllSessions() };
	}

	const pool = new DesktopGreenfieldRuntimeBackendPool({
		compositionDefaults: {
			modelRegistry: modelRegistry(model),
			initialModel: model,
			initialThinkingLevel: "off",
		},
	});
	const runtime = new RuntimeHost({
		sessionBackend: pool,
		getDefaultExecutionMode: () => "full-access",
	});
	return {
		runtime,
		dispose: async () => {
			try {
				await runtime.disposeAllSessions();
			} finally {
				await pool.dispose();
			}
		},
	};
}

function modelRegistry(model: Model<Api>): CodingAgentModelRegistrySource {
	return {
		refresh() {},
		getAvailable: () => [model],
		find: (provider, modelId) => (provider === model.provider && modelId === model.id ? model : undefined),
		getApiKey: async () => "test-key",
		setServerToken() {},
		loadRemoteModels: async () => undefined,
	};
}

const RUNTIME_BACKENDS = ["legacy", "greenfield"] as const;

const MODEL: Model<Api> = {
	id: "desktop-model-call-frame",
	name: "Desktop Model Call Frame",
	api: "openai-responses",
	provider: "test",
	baseUrl: "https://example.test",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8_000,
	maxTokens: 1_000,
};
