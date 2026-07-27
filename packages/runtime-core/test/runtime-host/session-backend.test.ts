import type { Api, Model } from "@vetta/ai";
import type { AgentSessionEvent } from "@vetta/coding-agent";
import { describe, expect, it, vi } from "vitest";
import {
	type HistoryEntry,
	RuntimeHost,
	type RuntimeHostSessionAssembly,
	type RuntimeHostSessionBackend,
	type RuntimeSession,
	type RuntimeSessionBackend,
	type RuntimeSessionCorePorts,
	type RuntimeSessionCreateOptions,
	type SessionEvent,
} from "../../src/index.js";

function createSessionDouble() {
	const listeners = new Set<(event: AgentSessionEvent) => void>();
	const unsubscribers: ReturnType<typeof vi.fn>[] = [];
	const prompt = vi.fn(async () => {});
	const continueTurn = vi.fn(async () => {});
	const abort = vi.fn(async () => {});
	const session = {
		sessionId: "session-from-backend",
		sessionFile: "session.jsonl",
		model: undefined,
		thinkingLevel: "off",
		isStreaming: false,
		messages: [
			{ role: "user", content: "visible", timestamp: 1 },
			{ role: "custom", customType: "hidden", content: "internal", display: false, timestamp: 2 },
		],
		sessionManager: {
			getCwd: () => undefined,
			getHeader: () => ({ parentSession: "parent.jsonl", parentEntryId: "entry-1" }),
			appendCustomEntry: vi.fn(),
		},
		getContextUsage: () => ({ percent: 25, contextWindow: 8_000 }),
		getActiveToolNames: () => ["read"],
		todoStore: {
			getAll: () => [],
		},
		prompt,
		agent: {
			continue: continueTurn,
		},
		abort,
		bindExtensions: vi.fn(async () => {}),
		subscribe: vi.fn((listener: (event: AgentSessionEvent) => void) => {
			listeners.add(listener);
			const unsubscribe = vi.fn(() => listeners.delete(listener));
			unsubscribers.push(unsubscribe);
			return unsubscribe;
		}),
		dispose: vi.fn(),
	} as unknown as RuntimeSession;

	return {
		session,
		unsubscribers,
		prompt,
		continueTurn,
		abort,
		emit: (event: AgentSessionEvent) => {
			for (const listener of listeners) listener(event);
		},
	};
}

class RecordingSessionBackend implements RuntimeSessionBackend {
	readonly calls: RuntimeSessionCreateOptions[] = [];

	constructor(private readonly session: RuntimeSession) {}

	async create(options: RuntimeSessionCreateOptions): Promise<RuntimeSession> {
		this.calls.push(options);
		return this.session;
	}
}

class RecordingAssemblyBackend implements RuntimeHostSessionBackend {
	readonly calls: RuntimeSessionCreateOptions[] = [];

	constructor(private readonly assembly: RuntimeHostSessionAssembly) {}

	async createAssembly(options: RuntimeSessionCreateOptions): Promise<RuntimeHostSessionAssembly> {
		this.calls.push(options);
		return this.assembly;
	}
}

describe("RuntimeHost session backend boundary", () => {
	it("creates and registers a session through the injected backend without changing config semantics", async () => {
		const { session } = createSessionDouble();
		const backend = new RecordingSessionBackend(session);
		const host = new RuntimeHost({
			sessionBackend: backend,
			getDefaultExecutionMode: () => "full-access",
		});

		const result = await host.createSession({
			scenario: "cli",
			agentMode: "coding",
			enableBackgroundTasks: true,
			includeAgentSkills: false,
		});

		expect(result).toEqual({ sessionId: "session-from-backend" });
		expect(backend.calls).toHaveLength(1);
		expect(backend.calls[0]).toMatchObject({
			scenario: "cli",
			agentMode: "coding",
			enableBackgroundTasks: true,
			enableSubagents: true,
			includeAgentSkills: false,
			customTools: undefined,
		});
		expect(session.bindExtensions).toHaveBeenCalledOnce();
		expect(session.subscribe).toHaveBeenCalledOnce();
	});

	it("preserves prompt, continue and abort delegation semantics", async () => {
		const { session, prompt, continueTurn, abort } = createSessionDouble();
		const host = new RuntimeHost({
			sessionBackend: new RecordingSessionBackend(session),
			getDefaultExecutionMode: () => "full-access",
		});
		const { sessionId } = await host.createSession();
		const metadata = { origin: "characterization-test" };

		await host.prompt(sessionId, {
			text: "hello",
			streamingBehavior: "followUp",
			metadata,
		});
		await host.continue(sessionId);
		await host.abort(sessionId);

		expect(prompt).toHaveBeenCalledWith("hello", {
			images: undefined,
			streamingBehavior: "followUp",
			promptRef: undefined,
			attachments: undefined,
			source: "extension",
			metadata,
		});
		expect(continueTurn).toHaveBeenCalledOnce();
		expect(abort).toHaveBeenCalledOnce();
	});

	it("uses core ports supplied by an assembly backend without deriving legacy adapters", async () => {
		const sessionDouble = createSessionDouble();
		const dispose = vi.fn(async () => {});
		const modelCalls: string[] = [];
		const prompt = vi.fn(async () => {
			modelCalls.push("prompt");
		});
		const continueTurn = vi.fn(async () => {});
		const abort = vi.fn(async () => {});
		const selectModel = vi.fn(async (modelKey: string, strategy: string) => {
			modelCalls.push(`select:${modelKey}:${strategy}`);
		});
		const setThinkingLevel = vi.fn((level: string) => {
			modelCalls.push(`thinking:${level}`);
		});
		const refreshAuth = vi.fn(async () => {});
		const legacyImageModel = createTestModel("legacy", "image-model", ["text", "image"]);
		const viewTextModel = createTestModel("view", "text-model", ["text"]);
		Object.assign(sessionDouble.session, { model: legacyImageModel });
		const readCurrentModel = vi.fn(() => viewTextModel);
		const refreshAvailableModels = vi.fn();
		const readAvailableModels = vi.fn((): Model<Api>[] => []);
		const resolveApiKey = vi.fn(async () => undefined);
		const eventListeners = new Set<(event: SessionEvent) => void>();
		const corePorts: RuntimeSessionCorePorts = {
			turnControl: { prompt, continue: continueTurn, abort },
			eventStream: {
				subscribe(handler) {
					eventListeners.add(handler);
					return () => eventListeners.delete(handler);
				},
			},
			stateReader: {
				readState: () => ({
					model: undefined,
					thinkingLevel: "off",
					isStreaming: false,
					messageCount: 7,
					contextPercent: 50,
					contextWindow: 16_000,
					activeToolNames: ["assembly-tool"],
				}),
				readMessages: () => [{ role: "user", content: "from assembly", timestamp: 3 }],
			},
		};
		const history: HistoryEntry[] = [
			{
				type: "message",
				message: { role: "user", content: "assembly history", timestamp: 4 },
			},
		];
		const navigateForEdit = vi.fn(async () => ({ text: "edit text", cancelled: false }));
		const switchBranch = vi.fn(() => ({ leafId: "branch-leaf" }));
		const deleteMessage = vi.fn(() => ({ leafId: "delete-leaf" }));
		const replaceLastUserMessage = vi.fn(() => ({ leafId: "replace-leaf" }));
		const forkSession = vi.fn(() => ({ path: "fork.jsonl", text: "fork text" }));
		const setName = vi.fn();
		const bindHostInteraction = vi.fn(async () => {});
		const backend = new RecordingAssemblyBackend({
			session: sessionDouble.session,
			lifecycle: {
				sessionId: "assembly-session",
				sessionPath: "assembly.jsonl",
				dispose,
			},
			historyReader: { readHistory: () => history },
			historyController: {
				navigateForEdit,
				switchBranch,
				deleteMessage,
				replaceLastUserMessage,
				forkSession,
				setName,
			},
			hostInteraction: { bind: bindHostInteraction },
			modelController: { selectModel, setThinkingLevel, refreshAuth },
			modelView: { readCurrentModel, refreshAvailableModels, readAvailableModels, resolveApiKey },
			corePorts,
		});
		const host = new RuntimeHost({ sessionBackend: backend, getDefaultExecutionMode: () => "full-access" });
		const { sessionId } = await host.createSession();

		await host.prompt(sessionId, {
			text: "through port",
			modelKey: "provider/model",
			reasoning: "high",
			images: [{ type: "image", data: "base64", mimeType: "image/png" }],
		});
		await host.updateSettings(sessionId, { modelKey: "provider/settings-model", thinkingLevel: "medium" });
		host.updateGlobalThinkingLevel("low");
		await host.reloadServerAuth("server-token");
		await host.continue(sessionId);
		await host.abort(sessionId);

		expect(backend.calls).toHaveLength(1);
		expect(sessionId).toBe("assembly-session");
		expect(bindHostInteraction).toHaveBeenCalledOnce();
		expect(prompt).toHaveBeenCalledWith({
			text: "through port",
			images: undefined,
			streamingBehavior: undefined,
			promptRef: undefined,
			attachments: undefined,
			metadata: undefined,
		});
		expect(continueTurn).toHaveBeenCalledOnce();
		expect(abort).toHaveBeenCalledOnce();
		expect(selectModel).toHaveBeenNthCalledWith(1, "provider/model", "if-changed");
		expect(selectModel).toHaveBeenNthCalledWith(2, "provider/settings-model", "always");
		expect(setThinkingLevel).toHaveBeenNthCalledWith(1, "high");
		expect(setThinkingLevel).toHaveBeenNthCalledWith(2, "medium");
		expect(setThinkingLevel).toHaveBeenNthCalledWith(3, "low");
		expect(refreshAuth).toHaveBeenCalledWith("server-token");
		expect(readCurrentModel).toHaveBeenCalledOnce();
		expect(modelCalls.slice(0, 3)).toEqual(["select:provider/model:if-changed", "thinking:high", "prompt"]);
		expect(sessionDouble.prompt).not.toHaveBeenCalled();
		expect(sessionDouble.session.subscribe).not.toHaveBeenCalled();
		expect(host.getState(sessionId)).toMatchObject({
			messageCount: 7,
			contextPercent: 50,
			activeToolNames: ["assembly-tool"],
		});
		expect(host.getMessages(sessionId)).toEqual([{ role: "user", content: "from assembly", timestamp: 3 }]);
		expect(host.getSessionPath(sessionId)).toBe("assembly.jsonl");
		expect(host.getFullHistory(sessionId)).toEqual(history);
		expect(await host.navigateForEdit(sessionId, "edit-entry")).toEqual({ text: "edit text", cancelled: false });
		expect(await host.switchBranch(sessionId, "branch-entry")).toEqual({ leafId: "branch-leaf" });
		expect(await host.deleteMessage(sessionId, "delete-entry")).toEqual({ leafId: "delete-leaf" });
		expect(await host.replaceLastUserMessage(sessionId, "replace-entry")).toEqual({ leafId: "replace-leaf" });
		expect(await host.forkSession(sessionId, "fork-entry")).toEqual({ path: "fork.jsonl", text: "fork text" });
		host.renameSessionById(sessionId, "renamed by id");
		await host.renameSession("assembly.jsonl", "renamed by path");
		expect(navigateForEdit).toHaveBeenCalledWith("edit-entry");
		expect(switchBranch).toHaveBeenCalledWith("branch-entry");
		expect(deleteMessage).toHaveBeenCalledWith("delete-entry");
		expect(replaceLastUserMessage).toHaveBeenCalledWith("replace-entry");
		expect(forkSession).toHaveBeenCalledWith("fork-entry");
		expect(setName).toHaveBeenNthCalledWith(1, "renamed by id");
		expect(setName).toHaveBeenNthCalledWith(2, "renamed by path");

		const reopened = await host.createSession({ sessionPath: "assembly.jsonl" });
		expect(reopened).toEqual({ sessionId });
		expect(backend.calls).toHaveLength(1);
		expect(bindHostInteraction).toHaveBeenCalledTimes(2);
		expect(sessionDouble.session.bindExtensions).not.toHaveBeenCalled();

		await host.disposeSession(sessionId);
		expect(dispose).toHaveBeenCalledOnce();
		expect(sessionDouble.session.dispose).not.toHaveBeenCalled();
	});

	it("maps live events and replays the current text delta after resubscribe", async () => {
		const { session, emit, unsubscribers } = createSessionDouble();
		const host = new RuntimeHost({
			sessionBackend: new RecordingSessionBackend(session),
			getDefaultExecutionMode: () => "full-access",
		});
		const { sessionId } = await host.createSession();
		const firstEvents: SessionEvent[] = [];
		const unsubscribeFirst = host.subscribe(sessionId, (event) => firstEvents.push(event));

		emit({ type: "agent_start" });
		emit({
			type: "message_update",
			assistantMessageEvent: { type: "text_delta", delta: "partial" },
		} as AgentSessionEvent);

		expect(firstEvents.map((event) => event.type)).toEqual([
			"session.lifecycle",
			"session.lifecycle",
			"message.delta",
		]);
		unsubscribeFirst();
		expect(session.subscribe).toHaveBeenCalledOnce();
		expect(unsubscribers[0]).not.toHaveBeenCalled();

		const replayedEvents: SessionEvent[] = [];
		host.subscribe(sessionId, (event) => replayedEvents.push(event));

		expect(replayedEvents.map((event) => event.type)).toEqual(["session.lifecycle", "message.delta"]);
		expect(replayedEvents[1]).toMatchObject({ type: "message.delta", delta: "partial" });
		expect(session.subscribe).toHaveBeenCalledOnce();
	});

	it("reads the public state and messages through the state port without changing their shape", async () => {
		const { session } = createSessionDouble();
		const host = new RuntimeHost({
			sessionBackend: new RecordingSessionBackend(session),
			getDefaultExecutionMode: () => "full-access",
		});
		const { sessionId } = await host.createSession({ scenario: "cli" });

		expect(host.getState(sessionId)).toMatchObject({
			sessionId,
			thinkingLevel: "off",
			executionMode: "full-access",
			isStreaming: false,
			messageCount: 2,
			contextPercent: 25,
			contextWindow: 8_000,
			activeToolNames: ["read"],
			scenario: "cli",
			parentSessionPath: "parent.jsonl",
			parentEntryId: "entry-1",
		});
		expect(host.getMessages(sessionId)).toEqual([{ role: "user", content: "visible", timestamp: 1 }]);
	});

	it.each(["error", "aborted"] as const)("preserves the %s running-change terminal reason", async (stopReason) => {
		const { session, emit } = createSessionDouble();
		const host = new RuntimeHost({
			sessionBackend: new RecordingSessionBackend(session),
			getDefaultExecutionMode: () => "full-access",
		});
		const changes: Array<{ running: boolean; reason: string | undefined }> = [];
		host.onRunningChanged((_path, running, _sessionId, reason) => changes.push({ running, reason }));
		await host.createSession();
		const message = assistantMessage(stopReason);

		emit({ type: "agent_start" });
		emit({ type: "message_end", message } as AgentSessionEvent);
		emit({ type: "agent_end", messages: [message] } as AgentSessionEvent);

		expect(changes).toEqual([
			{ running: true, reason: undefined },
			{ running: false, reason: stopReason },
		]);
	});

	it("releases the injected backend session and its permanent subscription", async () => {
		const { session, unsubscribers } = createSessionDouble();
		const host = new RuntimeHost({
			sessionBackend: new RecordingSessionBackend(session),
			getDefaultExecutionMode: () => "full-access",
		});
		const { sessionId } = await host.createSession();
		host.subscribe(sessionId, () => {});

		await host.disposeSession(sessionId);

		expect(unsubscribers[0]).toHaveBeenCalledOnce();
		expect(session.dispose).toHaveBeenCalledOnce();
		expect(host.getSessionPath(sessionId)).toBeUndefined();
	});
});

function createTestModel(provider: string, id: string, input: Array<"text" | "image">): Model<Api> {
	return { api: "openai-responses", provider, id, input } as Model<Api>;
}

function assistantMessage(stopReason: "error" | "aborted") {
	return {
		role: "assistant" as const,
		content: [{ type: "text" as const, text: stopReason }],
		api: "openai-responses" as const,
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
		stopReason,
		timestamp: 2,
	};
}
