import type { Api, Model } from "@vetta/ai";
import type { AgentSessionEvent } from "@vetta/coding-agent";
import {
	type RuntimeSession,
	RuntimeSessionBackendAssemblyAdapter,
	type RuntimeSessionCreateOptions,
} from "@vetta/coding-agent/runtime-host";
import { describe, expect, it, vi } from "vitest";
import {
	type AgentPluginRuntimeConfig,
	type BackgroundTaskInfo,
	type HistoryEntry,
	RuntimeHost,
	type RuntimeHostSessionAssembly,
	type RuntimeHostSessionBackend,
	type RuntimeSessionCorePorts,
	type RuntimeSessionCreateRequest,
	type RuntimeSubagentSnapshot,
	type SessionEvent,
	type TodoItem,
} from "../../src/index.js";

function createSessionDouble() {
	const listeners = new Set<(event: AgentSessionEvent) => void>();
	const unsubscribers: ReturnType<typeof vi.fn>[] = [];
	const prompt = vi.fn(async () => {});
	const continueTurn = vi.fn(async () => {});
	const abort = vi.fn(async () => {});
	const getCwd = vi.fn(() => undefined);
	const reconfigureCustomTools = vi.fn();
	const clearFinishedBackgroundTasks = vi.fn(() => 0);
	const killBackgroundTask = vi.fn(() => false);
	const listBackgroundTasks = vi.fn(() => []);
	const listSubagents = vi.fn(() => []);
	const interruptSubagent = vi.fn(() => undefined);
	const clearFinishedSubagents = vi.fn(() => 0);
	const getTodos = vi.fn(() => []);
	const isTodoLocked = vi.fn(() => false);
	const clearTodos = vi.fn();
	const setSteeringMode = vi.fn();
	const setFollowUpMode = vi.fn();
	const reconfigureAgentPlugins = vi.fn(async () => {});
	const setAgentMode = vi.fn();
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
			getCwd,
			getHeader: () => ({ parentSession: "parent.jsonl", parentEntryId: "entry-1" }),
			appendCustomEntry: vi.fn(),
		},
		getContextUsage: () => ({ percent: 25, contextWindow: 8_000 }),
		getActiveToolNames: () => ["read"],
		todoStore: {
			getAll: getTodos,
			isLocked: isTodoLocked,
			clear: clearTodos,
		},
		backgroundTasks: {
			clearFinished: clearFinishedBackgroundTasks,
			kill: killBackgroundTask,
			list: listBackgroundTasks,
		},
		listSubagents,
		interruptSubagent,
		clearFinishedSubagents,
		prompt,
		agent: {
			continue: continueTurn,
		},
		abort,
		reconfigureCustomTools,
		setSteeringMode,
		setFollowUpMode,
		reconfigureAgentPlugins,
		setAgentMode,
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
		getCwd,
		reconfigureCustomTools,
		clearFinishedBackgroundTasks,
		killBackgroundTask,
		listBackgroundTasks,
		listSubagents,
		interruptSubagent,
		clearFinishedSubagents,
		getTodos,
		isTodoLocked,
		clearTodos,
		setSteeringMode,
		setFollowUpMode,
		reconfigureAgentPlugins,
		setAgentMode,
		emit: (event: AgentSessionEvent) => {
			for (const listener of listeners) listener(event);
		},
	};
}

class RecordingSessionBackend implements RuntimeHostSessionBackend {
	readonly calls: RuntimeSessionCreateOptions[] = [];
	private readonly adapter: RuntimeSessionBackendAssemblyAdapter;

	constructor(session: RuntimeSession) {
		this.adapter = new RuntimeSessionBackendAssemblyAdapter({
			create: async (options: RuntimeSessionCreateOptions): Promise<RuntimeSession> => {
				this.calls.push(options);
				return session;
			},
		});
	}

	createAssembly(request: RuntimeSessionCreateRequest): Promise<RuntimeHostSessionAssembly> {
		return this.adapter.createAssembly(request);
	}
}

class RecordingAssemblyBackend implements RuntimeHostSessionBackend {
	readonly calls: RuntimeSessionCreateRequest[] = [];

	constructor(private readonly assembly: RuntimeHostSessionAssembly) {}

	async createAssembly(request: RuntimeSessionCreateRequest): Promise<RuntimeHostSessionAssembly> {
		this.calls.push(request);
		return this.assembly;
	}
}

describe("RuntimeHost session backend boundary", () => {
	it("does not expose the raw legacy session through the host assembly", () => {
		const hasRawSession: "session" extends keyof RuntimeHostSessionAssembly ? true : false = false;
		const hasLegacyCreationObjects: Extract<
			keyof RuntimeSessionCreateRequest,
			"sessionManager" | "customTools" | "modelRegistry"
		> extends never
			? false
			: true = false;

		expect(hasRawSession).toBe(false);
		expect(hasLegacyCreationObjects).toBe(false);
	});

	it("fails explicitly when no session composition was injected", async () => {
		const host = new RuntimeHost();

		await expect(host.createSession()).rejects.toMatchObject({
			code: "INTERNAL_ERROR",
			message: "RuntimeHost requires an explicit sessionBackend composition.",
			retryable: false,
			origin: "runtime",
		});
	});

	it("creates and registers a session through the injected backend without changing config semantics", async () => {
		const { session } = createSessionDouble();
		const backend = new RecordingSessionBackend(session);
		const userQuestionHandler = vi.fn(async () => ({
			cancelled: false,
			answers: [{ question: "Choose", answers: ["A"] }],
		}));
		const host = new RuntimeHost({
			sessionBackend: backend,
			getDefaultExecutionMode: () => "full-access",
			userQuestionHandler,
		});

		const result = await host.createSession({
			scenario: "cli",
			agentMode: "coding",
			enableBackgroundTasks: true,
			includeAgentSkills: false,
			askUserQuestion: true,
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
		const questionResult = await backend.calls[0]?.askUserQuestion?.ask({
			questions: [{ question: "Choose", header: "Choice", options: [{ label: "A", description: "A" }] }],
		});
		expect(questionResult).toEqual({
			cancelled: false,
			answers: [{ question: "Choose", answers: ["A"] }],
		});
		expect(userQuestionHandler).toHaveBeenCalledWith(
			expect.objectContaining({ sessionId: "session-from-backend" }),
			undefined,
		);
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

	it("uses the injected shared model controller for process-level refresh", async () => {
		const { session } = createSessionDouble();
		const refreshAuth = vi.fn(async () => {});
		const refreshInBackground = vi.fn();
		const host = new RuntimeHost({
			sessionBackend: new RecordingSessionBackend(session),
			sharedModelController: { refreshAuth, refreshInBackground },
			getDefaultExecutionMode: () => "full-access",
		});

		await host.createSession();
		await host.reloadServerAuth("server-token");

		expect(refreshInBackground).toHaveBeenCalledOnce();
		expect(refreshAuth).toHaveBeenCalledWith("server-token");
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
		const switchBranch = vi.fn(async () => ({ leafId: "branch-leaf" }));
		const deleteMessage = vi.fn(async () => ({ leafId: "delete-leaf" }));
		const replaceLastUserMessage = vi.fn(async () => ({ leafId: "replace-leaf" }));
		const forkSession = vi.fn(async () => ({ path: "fork.jsonl", text: "fork text" }));
		const setName = vi.fn(async () => {});
		const bindHostInteraction = vi.fn(async () => {});
		let busy = false;
		const isBusy = vi.fn(() => busy);
		let deferExecutionModeSwitch = false;
		let releaseExecutionModeSwitch: (() => void) | undefined;
		const reconfigureExecution = vi.fn(async () => {
			if (!deferExecutionModeSwitch) return;
			await new Promise<void>((resolve) => {
				releaseExecutionModeSwitch = resolve;
			});
		});
		const readWorkingDirectory = vi.fn(() => undefined);
		const backgroundTask: BackgroundTaskInfo = {
			id: "task-1",
			command: "echo work",
			cwd: "C:/workspace",
			status: "running",
			outputFile: "C:/workspace/task.log",
			exitCode: undefined,
			startedAt: 1,
			tail: "work",
		};
		const subagent: RuntimeSubagentSnapshot = {
			id: "agent-1",
			taskName: "worker",
			path: "/worker",
			agentType: "coding",
			status: "running",
			task: "work",
			parentSessionId: "assembly-session",
			startedAt: 2,
			generation: 0,
			usage: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, costTotal: 0.5 },
		};
		const todoItems: TodoItem[] = [{ id: 1, content: "work", status: "pending" }];
		const clearFinishedWork = vi.fn(() => 3);
		const killTask = vi.fn(() => true);
		const readTasks = vi.fn(() => [backgroundTask]);
		const readSubagents = vi.fn(() => [subagent]);
		const interruptWorkSubagent = vi.fn(() => subagent);
		const readTodoItems = vi.fn(() => todoItems);
		const clearTodoItems = vi.fn(() => true);
		const setConfigurationSteeringMode = vi.fn();
		const setConfigurationFollowUpMode = vi.fn();
		let pluginConfigurationFailure: Error | undefined;
		const reconfigureConfigurationPlugins = vi.fn(async () => {
			if (pluginConfigurationFailure) throw pluginConfigurationFailure;
		});
		const setConfigurationAgentMode = vi.fn();
		const backend = new RecordingAssemblyBackend({
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
			executionController: { isBusy, reconfigure: reconfigureExecution },
			workspaceView: { readWorkingDirectory },
			backgroundWorkController: {
				clearFinished: clearFinishedWork,
				killTask,
				readTasks,
				readSubagents,
				interruptSubagent: interruptWorkSubagent,
			},
			todoController: { readItems: readTodoItems, clear: clearTodoItems },
			configurationController: {
				setSteeringMode: setConfigurationSteeringMode,
				setFollowUpMode: setConfigurationFollowUpMode,
				reconfigureAgentPlugins: reconfigureConfigurationPlugins,
				setAgentMode: setConfigurationAgentMode,
			},
			modelController: { selectModel, setThinkingLevel, refreshAuth },
			modelView: { readCurrentModel, refreshAvailableModels, readAvailableModels, resolveApiKey },
			corePorts,
		});
		const host = new RuntimeHost({ sessionBackend: backend, getDefaultExecutionMode: () => "full-access" });
		const { sessionId } = await host.createSession({ enableAgentPlugins: true });
		const replayedEvents: SessionEvent[] = [];
		const unsubscribe = host.subscribe(sessionId, (event) => replayedEvents.push(event));
		host.setGlobalAgentMode("review");

		await host.prompt(sessionId, {
			text: "through port",
			modelKey: "provider/model",
			reasoning: "high",
			images: [{ type: "image", data: "base64", mimeType: "image/png" }],
		});
		await host.updateSettings(sessionId, {
			modelKey: "provider/settings-model",
			thinkingLevel: "medium",
			steeringMode: "all",
			followUpMode: "one-at-a-time",
		});
		host.updateGlobalThinkingLevel("low");
		await host.reloadServerAuth("server-token");
		await host.continue(sessionId);
		await host.abort(sessionId);

		expect(backend.calls).toHaveLength(1);
		expect(backend.calls[0]).toMatchObject({
			executionMode: "full-access",
			enableSubagents: true,
			getSessionId: expect.any(Function),
		});
		expect(backend.calls[0]).not.toHaveProperty("sessionManager");
		expect(backend.calls[0]).not.toHaveProperty("customTools");
		expect(backend.calls[0]).not.toHaveProperty("modelRegistry");
		expect(sessionId).toBe("assembly-session");
		expect(bindHostInteraction).toHaveBeenCalledOnce();
		expect(readWorkingDirectory).toHaveBeenCalledOnce();
		expect(replayedEvents.map((event) => event.type)).toEqual(["session.lifecycle", "todo_update"]);
		expect(replayedEvents[1]).toMatchObject({ type: "todo_update", items: todoItems });
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
		expect(setConfigurationSteeringMode).toHaveBeenCalledWith("all");
		expect(setConfigurationFollowUpMode).toHaveBeenCalledWith("one-at-a-time");
		expect(setConfigurationAgentMode).toHaveBeenCalledWith("review");
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
		expect(host.listBackgroundTasks(sessionId)).toEqual([backgroundTask]);
		expect(host.listSubagents(sessionId)).toEqual([subagent]);
		expect(host.killBackgroundTask(sessionId, "task-1")).toBe(true);
		expect(host.interruptSubagent(sessionId, "worker")).toEqual(subagent);
		expect(host.clearFinishedBackgroundTasks(sessionId)).toBe(3);
		expect(await host.clearTodos(sessionId)).toBe(true);
		expect(killTask).toHaveBeenCalledWith("task-1");
		expect(interruptWorkSubagent).toHaveBeenCalledWith("worker");
		expect(clearFinishedWork).toHaveBeenCalledOnce();
		expect(clearTodoItems).toHaveBeenCalledOnce();
		expect(sessionDouble.listBackgroundTasks).not.toHaveBeenCalled();
		expect(sessionDouble.listSubagents).not.toHaveBeenCalled();
		expect(sessionDouble.getTodos).not.toHaveBeenCalled();
		expect(sessionDouble.setSteeringMode).not.toHaveBeenCalled();
		expect(sessionDouble.setFollowUpMode).not.toHaveBeenCalled();
		expect(sessionDouble.reconfigureAgentPlugins).not.toHaveBeenCalled();
		expect(sessionDouble.setAgentMode).not.toHaveBeenCalled();

		const firstPluginConfig: AgentPluginRuntimeConfig = {
			skillPathContributions: [{ pluginId: "plugin-1", paths: ["C:/skills/one"] }],
		};
		const pluginError = new Error("plugin reconfigure failed");
		host.reconfigureAgentPlugins(firstPluginConfig);
		pluginConfigurationFailure = pluginError;
		await expect(host.continue(sessionId)).rejects.toBe(pluginError);
		expect(continueTurn).toHaveBeenCalledOnce();
		pluginConfigurationFailure = undefined;
		await host.continue(sessionId);
		expect(reconfigureConfigurationPlugins).toHaveBeenNthCalledWith(1, firstPluginConfig);
		expect(reconfigureConfigurationPlugins).toHaveBeenNthCalledWith(2, firstPluginConfig);

		const delayedPluginConfig: AgentPluginRuntimeConfig = {
			skillPathContributions: [{ pluginId: "plugin-2", paths: ["C:/skills/two"] }],
		};
		busy = true;
		host.reconfigureAgentPlugins(delayedPluginConfig);
		host.setGlobalAgentMode("planning");
		await host.continue(sessionId);
		expect(reconfigureConfigurationPlugins).toHaveBeenCalledTimes(2);
		expect(setConfigurationAgentMode).toHaveBeenCalledOnce();
		busy = false;
		await host.continue(sessionId);
		expect(reconfigureConfigurationPlugins).toHaveBeenNthCalledWith(3, delayedPluginConfig);
		expect(setConfigurationAgentMode).toHaveBeenNthCalledWith(2, "planning");
		expect(continueTurn).toHaveBeenCalledTimes(4);

		deferExecutionModeSwitch = true;
		const executionModeSwitch = host.setExecutionMode(sessionId, "sandbox");
		expect(reconfigureExecution).toHaveBeenCalledWith({
			mode: "sandbox",
			sessionId,
			sandboxHostPath: undefined,
			linuxBubblewrapPath: undefined,
			macosSandboxExecPath: undefined,
		});
		expect(host.getState(sessionId).executionMode).toBe("full-access");
		const releaseSwitch = releaseExecutionModeSwitch;
		if (!releaseSwitch) throw new Error("Expected deferred execution mode reconfiguration");
		releaseSwitch();
		await executionModeSwitch;
		deferExecutionModeSwitch = false;
		expect(host.getState(sessionId).executionMode).toBe("sandbox");
		busy = true;
		await expect(host.setExecutionMode(sessionId, "full-access")).rejects.toMatchObject({
			code: "EXECUTION_MODE_SWITCH_BLOCKED",
		});
		expect(reconfigureExecution).toHaveBeenCalledOnce();
		expect(sessionDouble.reconfigureCustomTools).not.toHaveBeenCalled();
		expect(sessionDouble.getCwd).not.toHaveBeenCalled();

		const reopened = await host.createSession({ sessionPath: "assembly.jsonl" });
		expect(reopened).toEqual({ sessionId });
		expect(backend.calls).toHaveLength(1);
		expect(bindHostInteraction).toHaveBeenCalledTimes(2);
		expect(sessionDouble.session.bindExtensions).not.toHaveBeenCalled();

		await host.disposeSession(sessionId);
		unsubscribe();
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
