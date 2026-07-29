import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, Message, Model } from "@vetta/ai";
import { AuthStorage, ModelRegistry } from "@vetta/coding-agent";
import { createLegacyRuntimeHostOptions } from "@vetta/coding-agent/runtime-host";
import type { CodingAgentModelRegistrySource } from "@vetta/coding-agent/runtime-host/greenfield";
import { RuntimeHost, type SessionEvent } from "@vetta/runtime-core";
import { afterEach, describe, expect, it } from "vitest";
import {
	startOpenAiResponsesTestServer,
	textResponseEvents,
	toolCallResponseEvents,
} from "../../../../cli-app/test/support/openai-responses-test-server.js";
import { DesktopGreenfieldRuntimeBackendPool } from "./desktop-greenfield-runtime-backend-pool.js";

interface RuntimeFixture {
	readonly runtime: RuntimeHost;
	readonly dispose: () => Promise<void>;
}

describe("Desktop RuntimeHost Legacy/Greenfield differential gate", () => {
	const directories: string[] = [];
	const fixtures: RuntimeFixture[] = [];

	afterEach(async () => {
		for (const fixture of fixtures.splice(0).reverse()) await fixture.dispose();
		for (const directory of directories.splice(0).reverse()) {
			await rm(directory, { recursive: true, force: true });
		}
	});

	for (const backend of ["legacy", "greenfield"] as const) {
		it(`${backend} preserves the common Desktop host lifecycle contract`, async () => {
			const cwd = await temporaryDirectory(`desktop-${backend}-differential-workspace-`);
			const sessionDir = await temporaryDirectory(`desktop-${backend}-differential-sessions-`);
			const agentStateDir = await temporaryDirectory(`desktop-${backend}-differential-agent-`);
			const fixture = createRuntimeFixture(backend, agentStateDir);
			fixtures.push(fixture);

			const created = await fixture.runtime.createSession({
				cwd,
				sessionDir,
				model: MODEL,
				thinkingLevel: "medium",
				scenario: "batch",
				executionMode: "full-access",
				enableBackgroundTasks: false,
				includeAgentSkills: false,
			});
			const sessionPath = fixture.runtime.getSessionPath(created.sessionId);
			if (!sessionPath) throw new Error(`${backend} did not expose a session path`);

			expect(fixture.runtime.getState(created.sessionId)).toMatchObject({
				sessionId: created.sessionId,
				model: MODEL,
				thinkingLevel: "medium",
				executionMode: "full-access",
				scenario: "batch",
				isStreaming: false,
				messageCount: 0,
			});
			expect(fixture.runtime.getMessages(created.sessionId)).toEqual([]);
			expect(fixture.runtime.getFullHistory(created.sessionId)).toEqual([]);

			await fixture.runtime.updateSettings(created.sessionId, {
				thinkingLevel: "low",
				steeringMode: "all",
				followUpMode: "one-at-a-time",
			});
			expect(fixture.runtime.getState(created.sessionId).thinkingLevel).toBe("low");

			await fixture.runtime.disposeSession(created.sessionId);
			await fixture.runtime.disposeSession(created.sessionId);
			const resumed = await fixture.runtime.createSession({
				cwd,
				sessionDir,
				sessionPath,
				model: MODEL,
				scenario: "batch",
				executionMode: "full-access",
				enableBackgroundTasks: false,
				includeAgentSkills: false,
			});
			expect(fixture.runtime.getSessionPath(resumed.sessionId)).toBe(sessionPath);
			expect(fixture.runtime.getFullHistory(resumed.sessionId)).toEqual([]);
		});
	}

	it("preserves a real provider Tool Loop and persisted result across backends", async () => {
		const observations: Record<"legacy" | "greenfield", RuntimeTurnObservation> = {
			legacy: emptyTurnObservation(),
			greenfield: emptyTurnObservation(),
		};

		for (const backend of ["legacy", "greenfield"] as const) {
			const cwd = await temporaryDirectory(`desktop-${backend}-turn-workspace-`);
			const sessionDir = await temporaryDirectory(`desktop-${backend}-turn-sessions-`);
			const agentStateDir = await temporaryDirectory(`desktop-${backend}-turn-agent-`);
			const sourcePath = join(cwd, "message.txt");
			await writeFile(sourcePath, "desktop tool fixture content", "utf8");
			const server = await startOpenAiResponsesTestServer((_request, index) =>
				index === 0
					? { kind: "events", events: toolCallResponseEvents("read", { path: sourcePath }) }
					: { kind: "events", events: textResponseEvents("The Desktop file was read.") },
			);
			const model = { ...MODEL, baseUrl: server.baseUrl };
			const fixture = createRuntimeFixture(backend, agentStateDir, model);
			fixtures.push(fixture);

			try {
				const created = await fixture.runtime.createSession({
					cwd,
					sessionDir,
					model,
					scenario: "batch",
					executionMode: "full-access",
					enableBackgroundTasks: false,
					includeAgentSkills: false,
				});
				const events: SessionEvent[] = [];
				const unsubscribe = fixture.runtime.subscribe(created.sessionId, (event) => events.push(event));

				await fixture.runtime.prompt(created.sessionId, { text: "Read message.txt" });
				unsubscribe();

				expect(server.requests).toHaveLength(2);
				expect(JSON.stringify(server.requests[1]?.body.input)).toContain("desktop tool fixture content");
				const sessionPath = fixture.runtime.getSessionPath(created.sessionId);
				if (!sessionPath) throw new Error(`${backend} did not persist the Tool Loop session`);
				const messagesBeforeResume = fixture.runtime.getMessages(created.sessionId);
				observations[backend] = observeTurn(events, messagesBeforeResume);

				await fixture.runtime.disposeSession(created.sessionId);
				const resumed = await fixture.runtime.createSession({
					cwd,
					sessionDir,
					sessionPath,
					model,
					scenario: "batch",
					executionMode: "full-access",
					enableBackgroundTasks: false,
					includeAgentSkills: false,
				});
				expect(observeMessages(fixture.runtime.getMessages(resumed.sessionId))).toEqual(
					observeMessages(messagesBeforeResume),
				);
			} finally {
				await server.dispose();
			}
		}

		expect(observations.legacy).toMatchObject({
			lifecycle: ["created", "agent_start", "turn_start", "turn_end", "turn_start", "turn_end", "agent_end"],
			finalAssistantText: "The Desktop file was read.",
			tools: [{ name: "read", isError: false }],
			messageRoles: ["user", "assistant", "toolResult", "assistant"],
		});
		expect(observations.greenfield).toEqual(observations.legacy);
	}, 30_000);

	for (const backend of ["legacy", "greenfield"] as const) {
		it(`${backend} keeps interactive, automation and batch ownership isolated in one RuntimeHost`, async () => {
			const agentStateDir = await temporaryDirectory(`desktop-${backend}-consumers-agent-`);
			const fixture = createRuntimeFixture(backend, agentStateDir);
			fixtures.push(fixture);
			const scenarios = ["conversation", "automation", "batch"] as const;
			const sessions: Array<{ readonly sessionId: string }> = [];

			for (const scenario of scenarios) {
				const cwd = await temporaryDirectory(`desktop-${backend}-${scenario}-workspace-`);
				const sessionDir = await temporaryDirectory(`desktop-${backend}-${scenario}-sessions-`);
				sessions.push(
					await fixture.runtime.createSession({
						cwd,
						sessionDir,
						model: MODEL,
						scenario,
						executionMode: "full-access",
						enableBackgroundTasks: scenario === "conversation",
						includeAgentSkills: false,
					}),
				);
			}

			expect(new Set(sessions.map(({ sessionId }) => sessionId)).size).toBe(3);
			expect(new Set(sessions.map(({ sessionId }) => fixture.runtime.getSessionPath(sessionId))).size).toBe(3);
			expect(sessions.map(({ sessionId }) => fixture.runtime.getState(sessionId).scenario)).toEqual(scenarios);

			await fixture.runtime.disposeSession(sessions[1]!.sessionId);
			expect(fixture.runtime.getState(sessions[0]!.sessionId).scenario).toBe("conversation");
			expect(fixture.runtime.getState(sessions[2]!.sessionId).scenario).toBe("batch");
		});
	}

	function createRuntimeFixture(
		backend: "legacy" | "greenfield",
		agentStateDir: string,
		model: Model<Api> = MODEL,
	): RuntimeFixture {
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
			return {
				runtime,
				dispose: () => runtime.disposeAllSessions(),
			};
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

	async function temporaryDirectory(prefix: string): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), prefix));
		directories.push(directory);
		return directory;
	}
});

interface RuntimeTurnObservation {
	readonly lifecycle: string[];
	readonly finalAssistantText: string;
	readonly tools: Array<{ readonly name: string; readonly isError: boolean }>;
	readonly messageRoles: string[];
}

function emptyTurnObservation(): RuntimeTurnObservation {
	return { lifecycle: [], finalAssistantText: "", tools: [], messageRoles: [] };
}

function observeTurn(events: readonly SessionEvent[], messages: readonly Message[]): RuntimeTurnObservation {
	return {
		lifecycle: events.flatMap((event) => (event.type === "session.lifecycle" ? [event.phase] : [])),
		finalAssistantText: observeMessages(messages).finalAssistantText,
		tools: events.flatMap((event) =>
			event.type === "tool.end" ? [{ name: event.toolName, isError: event.isError }] : [],
		),
		messageRoles: messages.map(({ role }) => role),
	};
}

function observeMessages(messages: readonly Message[]): {
	readonly finalAssistantText: string;
	readonly roles: string[];
} {
	const assistant = [...messages].reverse().find(({ role }) => role === "assistant");
	const finalAssistantText =
		assistant?.role === "assistant"
			? assistant.content.flatMap((content) => (content.type === "text" ? [content.text] : [])).join("\n")
			: "";
	return { finalAssistantText, roles: messages.map(({ role }) => role) };
}

function modelRegistry(model: Model<Api> = MODEL): CodingAgentModelRegistrySource {
	return {
		refresh() {},
		getAvailable: () => [model],
		find: (provider, modelId) => (provider === model.provider && modelId === model.id ? model : undefined),
		getApiKey: async () => "test-key",
		setServerToken() {},
		loadRemoteModels: async () => undefined,
	};
}

const MODEL: Model<Api> = {
	id: "desktop-differential-model",
	name: "Desktop Differential Model",
	api: "openai-responses",
	provider: "test",
	baseUrl: "https://example.test",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8_000,
	maxTokens: 1_000,
};
