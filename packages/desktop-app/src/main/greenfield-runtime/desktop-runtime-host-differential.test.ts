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

	it("preserves real Tool Loop events, persistence and host-restart recovery across backends", async () => {
		const observations: Record<"legacy" | "greenfield", RuntimeLifecycleObservation> = {
			legacy: emptyLifecycleObservation(),
			greenfield: emptyLifecycleObservation(),
		};

		for (const backend of ["legacy", "greenfield"] as const) {
			const cwd = await temporaryDirectory(`desktop-${backend}-turn-workspace-`);
			const sessionDir = await temporaryDirectory(`desktop-${backend}-turn-sessions-`);
			const agentStateDir = await temporaryDirectory(`desktop-${backend}-turn-agent-`);
			const sourcePath = join(cwd, "message.txt");
			await writeFile(sourcePath, "desktop tool fixture content", "utf8");
			const server = await startOpenAiResponsesTestServer((_request, index) => {
				if (index === 0) {
					return { kind: "events", events: toolCallResponseEvents("read", { path: sourcePath }) };
				}
				return {
					kind: "events",
					events: textResponseEvents(index === 1 ? "The Desktop file was read." : "The Desktop session resumed."),
				};
			});
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
				const initial = observeTurn(events, messagesBeforeResume, cwd);

				await fixture.dispose();
				const restartedFixture = createRuntimeFixture(backend, agentStateDir, model);
				fixtures.push(restartedFixture);
				const resumed = await restartedFixture.runtime.createSession({
					cwd,
					sessionDir,
					sessionPath,
					model,
					scenario: "batch",
					executionMode: "full-access",
					enableBackgroundTasks: false,
					includeAgentSkills: false,
				});
				const restoredMessages = restartedFixture.runtime.getMessages(resumed.sessionId);
				const resumedEvents: SessionEvent[] = [];
				const unsubscribeResumed = restartedFixture.runtime.subscribe(resumed.sessionId, (event) =>
					resumedEvents.push(event),
				);
				await restartedFixture.runtime.prompt(resumed.sessionId, { text: "Continue after host restart" });
				unsubscribeResumed();
				expect(server.requests).toHaveLength(3);
				const resumedProviderInput = JSON.stringify(server.requests[2]?.body.input);
				observations[backend] = {
					initial,
					resumed: observeTurn(resumedEvents, restartedFixture.runtime.getMessages(resumed.sessionId), cwd),
					historyRestoredBeforePrompt:
						JSON.stringify(observeMessages(restoredMessages)) ===
						JSON.stringify(observeMessages(messagesBeforeResume)),
					sessionIdentityRestored: resumed.sessionId === created.sessionId,
					resumedProviderSawPriorToolResult: resumedProviderInput.includes("desktop tool fixture content"),
					resumedProviderSawPriorAssistant: resumedProviderInput.includes("The Desktop file was read."),
				};
			} finally {
				await server.dispose();
			}
		}

		expect(observations.legacy).toMatchObject({
			initial: {
				lifecycle: ["created", "agent_start", "turn_start", "turn_end", "turn_start", "turn_end", "agent_end"],
				finalAssistantText: "The Desktop file was read.",
				tools: [{ name: "read", isError: false }],
				messageRoles: ["user", "assistant", "toolResult", "assistant"],
			},
			resumed: {
				lifecycle: ["created", "agent_start", "turn_start", "turn_end", "agent_end"],
				finalAssistantText: "The Desktop session resumed.",
				tools: [],
				messageRoles: ["user", "assistant", "toolResult", "assistant", "user", "assistant"],
			},
			historyRestoredBeforePrompt: true,
			sessionIdentityRestored: true,
			resumedProviderSawPriorToolResult: true,
			resumedProviderSawPriorAssistant: true,
		});
		expect(observations.legacy.initial.events.map(({ type }) => type)).toEqual([
			"session.lifecycle",
			"mcp.reload.start",
			"mcp.reload.end",
			"session.lifecycle",
			"session.lifecycle",
			"toolcall.start",
			"message.final",
			"usage.update",
			"tool.start",
			"tool.end",
			"session.lifecycle",
			"session.lifecycle",
			"message.delta",
			"message.final",
			"usage.update",
			"session.lifecycle",
			"session.lifecycle",
		]);
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
	readonly events: RuntimeEventObservation[];
}

interface RuntimeEventObservation {
	readonly type: SessionEvent["type"];
	readonly source: SessionEvent["source"];
	readonly detail?: unknown;
}

interface RuntimeLifecycleObservation {
	readonly initial: RuntimeTurnObservation;
	readonly resumed: RuntimeTurnObservation;
	readonly historyRestoredBeforePrompt: boolean;
	readonly sessionIdentityRestored: boolean;
	readonly resumedProviderSawPriorToolResult: boolean;
	readonly resumedProviderSawPriorAssistant: boolean;
}

function emptyLifecycleObservation(): RuntimeLifecycleObservation {
	const emptyTurn = (): RuntimeTurnObservation => ({
		lifecycle: [],
		finalAssistantText: "",
		tools: [],
		messageRoles: [],
		events: [],
	});
	return {
		initial: emptyTurn(),
		resumed: emptyTurn(),
		historyRestoredBeforePrompt: false,
		sessionIdentityRestored: false,
		resumedProviderSawPriorToolResult: false,
		resumedProviderSawPriorAssistant: false,
	};
}

function observeTurn(
	events: readonly SessionEvent[],
	messages: readonly Message[],
	cwd: string,
): RuntimeTurnObservation {
	return {
		lifecycle: events.flatMap((event) => (event.type === "session.lifecycle" ? [event.phase] : [])),
		finalAssistantText: observeMessages(messages).finalAssistantText,
		tools: events.flatMap((event) =>
			event.type === "tool.end" ? [{ name: event.toolName, isError: event.isError }] : [],
		),
		messageRoles: messages.map(({ role }) => role),
		events: events.map((event) => observeEvent(event, cwd)),
	};
}

function observeEvent(event: SessionEvent, cwd: string): RuntimeEventObservation {
	const base = { type: event.type, source: event.source };
	switch (event.type) {
		case "session.lifecycle":
			return { ...base, detail: event.phase };
		case "message.delta":
		case "thinking.delta":
			return { ...base, detail: event.delta };
		case "message.final":
			return { ...base, detail: observeMessages([event.message]) };
		case "toolcall.start":
			return { ...base, detail: { toolName: event.toolName } };
		case "tool.start":
			return { ...base, detail: { toolName: event.toolName, args: normalizeEventValue(event.args, cwd) } };
		case "tool.end":
			return {
				...base,
				detail: {
					toolName: event.toolName,
					isError: event.isError,
					result: normalizeEventValue(event.result, cwd),
				},
			};
		case "usage.update":
			return {
				...base,
				detail: {
					input: event.input,
					output: event.output,
					cacheRead: event.cacheRead,
					cacheWrite: event.cacheWrite,
					contextPercent: event.contextPercent,
					contextWindow: event.contextWindow,
				},
			};
		default:
			return base;
	}
}

function normalizeEventValue(value: unknown, cwd: string): unknown {
	if (typeof value === "string") return value.replaceAll(cwd, "<workspace>");
	if (Array.isArray(value)) return value.map((entry) => normalizeEventValue(entry, cwd));
	if (typeof value !== "object" || value === null) return value;
	return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizeEventValue(entry, cwd)]));
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
