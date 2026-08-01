import { existsSync, mkdirSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "@sinclair/typebox";
import { Agent, type AgentTool } from "@vetta/agent-core";
import type { Api, Model } from "@vetta/ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentSession, type AgentSessionConfig, type AgentSessionEvent } from "../src/core/agent-session.js";
import { AuthStorage } from "../src/core/auth-storage.js";
import { prepareCompaction } from "../src/core/compaction/index.js";
import type { McpManager } from "../src/core/mcp/index.js";
import { ModelRegistry } from "../src/core/model-registry.js";
import { SessionManager } from "../src/core/session-manager/index.js";
import { SettingsManager } from "../src/core/settings-manager.js";
import type {
	SubagentChildHandle,
	SubagentParentContext,
	SubagentSessionFactory,
} from "../src/core/subagents/types.js";
import type { AgentPluginRuntimeConfig } from "../src/core/system-prompt.js";
import { TODO_SNAPSHOT_TYPE } from "../src/core/todo-store.js";
import { assistantMsg, createTestResourceLoader, userMsg } from "./utilities.js";

interface HeldChild {
	readonly handle: SubagentChildHandle;
	readonly calls: string[];
}

interface Deferred {
	readonly promise: Promise<void>;
	readonly resolve: () => void;
}

interface IdentityFixture {
	readonly session: AgentSession;
	readonly sessionManager: SessionManager;
	readonly tempDir: string;
	readonly parentContexts: SubagentParentContext[];
}

type IdentityFixtureOptions = Partial<
	Pick<
		AgentSessionConfig,
		| "agentPlugins"
		| "invokePluginContinuation"
		| "invokePluginSystemPrompt"
		| "initialActiveToolNames"
		| "memoryMode"
		| "memoryFile"
	>
>;

const sessions: AgentSession[] = [];
const tempDirs: string[] = [];
const TEST_MODEL: Model<Api> = {
	id: "model",
	name: "Model",
	api: "openai-responses",
	provider: "test",
	baseUrl: "https://example.test",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8_000,
	maxTokens: 1_000,
};

afterEach(async () => {
	await Promise.allSettled(sessions.splice(0).map((session) => session.close()));
	for (const tempDir of tempDirs.splice(0)) {
		if (existsSync(tempDir)) rmSync(tempDir, { recursive: true });
	}
});

describe("AgentSession identity resource transition", () => {
	it("keeps the current identity resources when an Extension cancels the transition", async () => {
		const fixture = createIdentityFixture([]);
		const { session } = fixture;
		const oldBackgroundTasks = session.backgroundTasks;
		const oldSubagents = session.subagents;
		const internals = session as unknown as {
			_runtime: {
				_extensionRunner?: {
					hasHandlers(eventType: string): boolean;
					emit(event: { type: string }): Promise<{ cancel: boolean }>;
				};
			};
		};
		internals._runtime._extensionRunner = {
			hasHandlers: (eventType) => eventType === "session_before_switch",
			emit: async () => ({ cancel: true }),
		};

		await expect(session.newSession()).resolves.toBe(false);
		expect(session.backgroundTasks).toBe(oldBackgroundTasks);
		expect(session.subagents).toBe(oldSubagents);
	});

	it("quiets old background and subagent work before new_session, then binds fresh resources", async () => {
		const firstChild = createHeldChild();
		const secondChild = createHeldChild(false);
		const fixture = createIdentityFixture([firstChild.handle, secondChild.handle]);
		const { session, parentContexts, tempDir } = fixture;
		const sourceSessionId = session.sessionId;
		const oldBackgroundTasks = session.backgroundTasks;
		const oldSubagents = session.subagents;
		const oldMcpManager = session.mcpManager;
		const commandToolName = process.platform === "win32" ? "shell" : "bash";
		const oldCommandTool = session.state.tools.find((tool) => tool.name === commandToolName);

		session.todoStore.createMany(["source todo"]);
		await oldSubagents?.spawn({ taskName: "held", message: "wait", agentType: "explorer" });
		const pidPath = join(tempDir, "identity-background.pid");
		const task = oldBackgroundTasks.spawn({
			command: heldProcessCommand("identity-background.pid"),
			cwd: tempDir,
			env: process.env,
		});
		const pid = await waitForPid(pidPath);
		expect(isProcessAlive(pid)).toBe(true);

		await expect(session.newSession()).resolves.toBe(true);

		expect(isProcessAlive(pid)).toBe(false);
		expect(oldBackgroundTasks.get(task.id)?.status).toBe("killed");
		expect(session.backgroundTasks).not.toBe(oldBackgroundTasks);
		expect(session.subagents).not.toBe(oldSubagents);
		expect(session.mcpManager).toBe(oldMcpManager);
		expect(session.sessionId).not.toBe(sourceSessionId);
		expect(session.todoStore.getAll()).toEqual([]);
		expect(firstChild.calls).toEqual(["abort", "wait", "close"]);
		expect(parentContexts[0]?.parentSessionId).toBe(sourceSessionId);

		await session.subagents?.spawn({ taskName: "held", message: "new parent", agentType: "explorer" });
		expect(parentContexts[1]?.parentSessionId).toBe(session.sessionId);
		expect(parentContexts[1]?.parentSessionFile).toBe(session.sessionFile);

		const commandTool = session.state.tools.find((tool) => tool.name === commandToolName);
		if (!commandTool) throw new Error(`Missing ${commandToolName} tool`);
		expect(commandTool).toBe(oldCommandTool);
		const toolResult = await commandTool.execute("after-transition", {
			command: heldProcessCommand("identity-followup.pid"),
			run_in_background: true,
		});
		const followupId = readBackgroundTaskId(toolResult.details);
		expect(session.backgroundTasks.get(followupId)?.status).toBe("running");
		expect(session.backgroundTasks.get(followupId)?.command).toContain("identity-followup.pid");
		expect(oldBackgroundTasks.get(followupId)?.command).toContain("identity-background.pid");
		session.backgroundTasks.onNotify = undefined;
		expect(session.backgroundTasks.kill(followupId, "dispose")).toBe(true);
		await expect(session.backgroundTasks.wait(followupId, { maxMs: 5_000 })).resolves.toMatchObject({
			stillRunning: false,
		});
	});

	it("quiets direct Bash before identity replacement and persists its result only to the source Session", async () => {
		const fixture = createIdentityFixture([]);
		const { session, sessionManager, tempDir } = fixture;
		sessionManager.appendMessage(userMsg("source turn"));
		sessionManager.appendMessage(assistantMsg("source answer"));
		session.agent.replaceMessages(sessionManager.buildSessionContext().messages);
		const sourcePath = session.sessionFile;
		if (!sourcePath) throw new Error("Expected persisted source session");
		const pidPath = join(tempDir, "identity-direct-bash.pid");
		const execution = session.executeBash(heldProcessCommandAt(pidPath));
		const pid = await waitForPid(pidPath);
		try {
			expect(isProcessAlive(pid)).toBe(true);
			await expect(session.newSession()).resolves.toBe(true);
			expect(isProcessAlive(pid)).toBe(false);
			await expect(execution).resolves.toBeDefined();
			const sourceTranscript = await readFile(sourcePath, "utf8");
			expect(sourceTranscript).toContain('"role":"bashExecution"');
			expect(sourceTranscript).toContain("identity-direct-bash.pid");
			expect(session.messages.some((message) => message.role === "bashExecution")).toBe(false);
		} finally {
			if (isProcessAlive(pid)) process.kill(pid);
			await Promise.allSettled([execution]);
		}
	});

	it("keeps Runtime and host tool configuration while clearing deferred MCP activation", async () => {
		const fixture = createIdentityFixture([]);
		const { session } = fixture;
		const internals = session as unknown as {
			_runtime: {
				_mcpManager?: McpManager;
				buildRuntime(options: { includeAllExtensionTools?: boolean }): void;
			};
		};
		const runtime = internals._runtime;
		const mcpTools = createDeferredMcpTools();
		const manager = {
			getTools: () => mcpTools,
			shutdown: async () => {},
		} as unknown as McpManager;
		runtime._mcpManager = manager;
		runtime.buildRuntime({ includeAllExtensionTools: true });

		session.setActiveToolsByName(session.getActiveToolNames().filter((name) => name !== "write"));
		const searchTool = session.state.tools.find((tool) => tool.name === "tool_search");
		if (!searchTool) throw new Error("Missing tool_search");
		await searchTool.execute("activate-deferred", { query: "identity needle", max_results: 1 });
		expect(session.getActiveToolNames()).toContain("mcp_identity_tool_15");

		await expect(session.newSession()).resolves.toBe(true);
		expect(internals._runtime).toBe(runtime);
		expect(session.mcpManager).toBe(manager);
		expect(session.getActiveToolNames()).not.toContain("mcp_identity_tool_15");
		expect(session.getActiveToolNames()).not.toContain("write");
		expect(session.getActiveToolNames()).toContain("tool_search");
	});

	it("resets Plugin run, pending effects and continuation idempotency per Session identity", async () => {
		const runIndexes: number[] = [];
		const continuationSessions: string[] = [];
		const agentPlugins: AgentPluginRuntimeConfig = {
			systemPromptProviderContributions: [
				{ pluginId: "identity-plugin", id: "prompt", handlerId: "prompt-handler" },
			],
			continuationContributions: [{ pluginId: "identity-plugin", id: "continue", handlerId: "continue-handler" }],
		};
		const fixture = createIdentityFixture([], {
			agentPlugins,
			invokePluginSystemPrompt: async (invocation) => {
				runIndexes.push(invocation.runtime.runIndex);
				return [];
			},
			invokePluginContinuation: async (invocation) => {
				continuationSessions.push(invocation.session.id);
				return {
					value: { text: "continue identity work", idempotencyKey: "same-work" },
					effects: [{ type: "setToolEnabled", toolName: "read", enabled: false }],
				};
			},
		});
		const { session } = fixture;
		const runtime = (session as unknown as { _runtime: object })._runtime;
		await session.prepareSystemPromptForAgentRun([]);
		expect(await collectContinuationText(session)).toBe("continue identity work");
		const sourceSessionId = session.sessionId;

		await expect(session.newSession()).resolves.toBe(true);
		expect((session as unknown as { _runtime: object })._runtime).toBe(runtime);
		await session.prepareSystemPromptForAgentRun([]);
		expect(session.state.tools.some((tool) => tool.name === "read")).toBe(true);
		expect(await collectContinuationText(session)).toBe("continue identity work");
		expect(runIndexes).toEqual([0, 0]);
		expect(continuationSessions).toEqual([sourceSessionId, session.sessionId]);
	});

	it("drops the outgoing EventRouter assistant cache before reconnecting the new identity", async () => {
		const fixture = createIdentityFixture([]);
		const { session } = fixture;
		const internals = session as unknown as {
			_events: { _lastAssistantMessage?: unknown; _turnIndex: number };
		};
		internals._events._lastAssistantMessage = assistantMsg("stale assistant");
		internals._events._turnIndex = 4;

		await expect(session.newSession()).resolves.toBe(true);
		expect(internals._events._lastAssistantMessage).toBeUndefined();
		expect(internals._events._turnIndex).toBe(0);
	});

	it("restores target Todo state on switch and rotates resources again on fork", async () => {
		const fixture = createIdentityFixture([]);
		const { session, sessionManager, tempDir } = fixture;
		session.todoStore.createMany(["source todo"]);
		expect(await collectContinuationText(session)).toContain("source todo");

		const targetManager = SessionManager.create(tempDir);
		targetManager.appendMessage(userMsg("target history"));
		targetManager.appendMessage(assistantMsg("target answer"));
		targetManager.appendCustomEntry(TODO_SNAPSHOT_TYPE, {
			items: [{ id: 1, content: "target todo", status: "in_progress" }],
			lockedBy: null,
		});
		expect(targetManager.getBranch().some((entry) => entry.type === "custom")).toBe(true);
		const targetPath = targetManager.getSessionFile();
		targetManager.close();
		if (!targetPath) throw new Error("Expected persisted target session");

		const sourceBackgroundTasks = session.backgroundTasks;
		await expect(session.switchSession(targetPath)).resolves.toBe(true);
		expect(session.backgroundTasks).not.toBe(sourceBackgroundTasks);
		expect(sessionManager.getBranch().some((entry) => entry.type === "custom")).toBe(true);
		expect(session.todoStore.getAll()).toEqual([{ id: 1, content: "target todo", status: "in_progress" }]);
		expect(await collectContinuationText(session)).toContain("target todo");

		const entryId = sessionManager.appendMessage(userMsg("fork this turn"));
		session.agent.replaceMessages(sessionManager.buildSessionContext().messages);
		const switchedBackgroundTasks = session.backgroundTasks;
		await expect(session.fork(entryId)).resolves.toMatchObject({ cancelled: false });
		expect(session.backgroundTasks).not.toBe(switchedBackgroundTasks);
		expect(session.todoStore.getAll()).toEqual([{ id: 1, content: "target todo", status: "in_progress" }]);
		expect(await collectContinuationText(session)).toContain("target todo");
	});

	it("reactivates the source identity when quiescing fails before replacement", async () => {
		const fixture = createIdentityFixture([]);
		const { session } = fixture;
		const sourceId = session.sessionId;
		const sourceFile = session.sessionFile;
		const sourceBackgroundTasks = session.backgroundTasks;
		const internals = session as unknown as {
			_ctx: { quiesceSessionIdentityResources(): Promise<void> };
		};
		const originalQuiesce = internals._ctx.quiesceSessionIdentityResources;
		internals._ctx.quiesceSessionIdentityResources = async () => {
			await originalQuiesce();
			throw new Error("quiesce failed");
		};

		await expect(session.newSession()).rejects.toThrow("quiesce failed");
		expect(session.sessionId).toBe(sourceId);
		expect(session.sessionFile).toBe(sourceFile);
		expect(session.backgroundTasks).not.toBe(sourceBackgroundTasks);
	});

	it("starts a prompt only after an already queued identity transition commits", async () => {
		const fixture = createIdentityFixture([]);
		const { session, tempDir } = fixture;
		const target = SessionManager.create(tempDir, tempDir);
		const targetPath = target.getSessionFile();
		target.close();
		if (!targetPath) throw new Error("Expected target session path");
		const entered = deferred();
		const release = deferred();
		const promptSessionIds: string[] = [];
		const internals = session as unknown as {
			_ctx: { quiesceSessionIdentityResources(): Promise<void> };
			_input: { prompt(text: string): Promise<void> };
		};
		const originalQuiesce = internals._ctx.quiesceSessionIdentityResources;
		internals._ctx.quiesceSessionIdentityResources = async () => {
			entered.resolve();
			await release.promise;
			await originalQuiesce();
		};
		vi.spyOn(internals._input, "prompt").mockImplementation(async () => {
			promptSessionIds.push(session.sessionId);
		});

		const switching = session.switchSession(targetPath);
		await entered.promise;
		const prompting = session.prompt("after switch");
		await Promise.resolve();
		expect(promptSessionIds).toEqual([]);

		release.resolve();
		await Promise.all([switching, prompting]);
		expect(promptSessionIds).toEqual([session.sessionId]);
		expect(session.sessionFile).toBe(targetPath);
	});

	it("starts ordinary Session work immediately when no identity transition is pending", async () => {
		const fixture = createIdentityFixture([]);
		const { session } = fixture;
		let started = false;
		const internals = session as unknown as {
			_input: { prompt(text: string): Promise<void> };
		};
		vi.spyOn(internals._input, "prompt").mockImplementation(async () => {
			started = true;
		});

		const prompting = session.prompt("start immediately");
		expect(started).toBe(true);
		await prompting;
	});

	it("rejects immediate identity-bound mutations while a transition is pending", async () => {
		const fixture = createIdentityFixture([]);
		const { session, tempDir } = fixture;
		const target = SessionManager.create(tempDir, tempDir);
		const targetPath = target.getSessionFile();
		target.close();
		if (!targetPath) throw new Error("Expected target session path");
		const entered = deferred();
		const release = deferred();
		const internals = session as unknown as {
			_ctx: { quiesceSessionIdentityResources(): Promise<void> };
		};
		const originalQuiesce = internals._ctx.quiesceSessionIdentityResources;
		internals._ctx.quiesceSessionIdentityResources = async () => {
			entered.resolve();
			await release.promise;
			await originalQuiesce();
		};

		const switching = session.switchSession(targetPath);
		await entered.promise;
		const mutations = [
			() => session.clearQueue(),
			() => session.setThinkingLevel("off"),
			() => session.cycleThinkingLevel(),
			() =>
				session.recordBashResult("pwd", {
					output: "",
					exitCode: 0,
					cancelled: false,
					truncated: false,
				}),
			() => session.setSessionName("wrong identity"),
			() => session.switchBranch("missing"),
			() => session.deleteMessage("missing"),
			() => session.exportForkToNewFile("missing"),
		];
		for (const mutate of mutations) {
			expect(mutate).toThrow("Session identity transition is pending");
		}

		release.resolve();
		await switching;
		expect(session.sessionFile).toBe(targetPath);
	});

	it("runs tree navigation against the target after a queued identity transition", async () => {
		const fixture = createIdentityFixture([]);
		const { session, tempDir } = fixture;
		const target = SessionManager.create(tempDir, tempDir);
		const targetEntryId = target.appendMessage(userMsg("edit target turn"));
		target.appendMessage(assistantMsg("target answer"));
		const targetPath = target.getSessionFile();
		target.close();
		if (!targetPath) throw new Error("Expected target session path");
		const entered = deferred();
		const release = deferred();
		const internals = session as unknown as {
			_ctx: { quiesceSessionIdentityResources(): Promise<void> };
		};
		const originalQuiesce = internals._ctx.quiesceSessionIdentityResources;
		internals._ctx.quiesceSessionIdentityResources = async () => {
			entered.resolve();
			await release.promise;
			await originalQuiesce();
		};

		const switching = session.switchSession(targetPath);
		await entered.promise;
		let settled = false;
		const navigating = session.navigateTree(targetEntryId).then(
			(value) => {
				settled = true;
				return value;
			},
			(error: unknown) => {
				settled = true;
				throw error;
			},
		);
		await Promise.resolve();
		expect(settled).toBe(false);

		release.resolve();
		await switching;
		await expect(navigating).resolves.toMatchObject({ cancelled: false, editorText: "edit target turn" });
		expect(session.sessionFile).toBe(targetPath);
	});

	it("waits for admitted tree mutation to settle before replacing identity", async () => {
		const fixture = createIdentityFixture([]);
		const { session, sessionManager } = fixture;
		const targetEntryId = sessionManager.appendMessage(userMsg("source tree target"));
		sessionManager.appendMessage(assistantMsg("source tree answer"));
		session.agent.replaceMessages(sessionManager.buildSessionContext().messages);
		const sourceId = session.sessionId;
		const entered = deferred();
		const release = deferred();
		const internals = session as unknown as {
			_runtime: {
				_extensionRunner?: {
					hasHandlers(eventType: string): boolean;
					emit(event: { type: string }): Promise<unknown>;
				};
			};
		};
		internals._runtime._extensionRunner = {
			hasHandlers: (eventType) => eventType === "session_before_tree",
			emit: async (event) => {
				if (event.type === "session_before_tree") {
					entered.resolve();
					await release.promise;
				}
				return undefined;
			},
		};

		const navigating = session.navigateTree(targetEntryId);
		await entered.promise;
		let switched = false;
		const switching = session.newSession().then((result) => {
			switched = true;
			return result;
		});
		await Promise.resolve();
		expect(switched).toBe(false);
		expect(session.sessionId).toBe(sourceId);

		release.resolve();
		await expect(navigating).resolves.toMatchObject({ cancelled: false, editorText: "source tree target" });
		await expect(switching).resolves.toBe(true);
		expect(session.sessionId).not.toBe(sourceId);
	});

	it("continues runtime resources while rebinding storage identity after memory rollover", async () => {
		const child = createHeldChild(false);
		const fixture = createIdentityFixture([child.handle], { memoryMode: true, memoryFile: "" });
		const { session, sessionManager, parentContexts } = fixture;
		const sourceId = session.sessionId;
		const sourcePath = session.sessionFile;
		const backgroundTasks = session.backgroundTasks;
		const subagents = session.subagents;
		sessionManager.appendMessage(userMsg("rollover source"));
		sessionManager.appendMessage(assistantMsg("source answer"));
		sessionManager.appendMessage(userMsg("kept tail"));
		sessionManager.appendMessage(assistantMsg("tail answer"));
		session.agent.replaceMessages(sessionManager.buildSessionContext().messages);
		session.settingsManager.applyOverrides({ compaction: { keepRecentTokens: 1 } });
		const preparation = prepareCompaction(
			sessionManager.getBranch(),
			session.settingsManager.getCompactionSettings(),
		);
		if (!preparation) throw new Error("Expected compaction preparation");
		const { firstKeptEntryId } = preparation;
		vi.spyOn(session.modelRegistry, "getApiKey").mockResolvedValue("test-key");
		const events: AgentSessionEvent[] = [];
		session.subscribe((event) => events.push(event));
		const internals = session as unknown as {
			_runtime: {
				_extensionRunner?: {
					hasHandlers(eventType: string): boolean;
					emit(event: { type: string }): Promise<unknown>;
				};
			};
			_compaction: { performAutoCompaction(reason: "threshold", willRetry: boolean): Promise<void> };
		};
		internals._runtime._extensionRunner = {
			hasHandlers: (eventType) => eventType === "session_before_compact",
			emit: async (event) =>
				event.type === "session_before_compact"
					? {
							compaction: {
								summary: "rollover summary",
								firstKeptEntryId,
								tokensBefore: 100,
							},
						}
					: undefined,
		};

		await internals._compaction.performAutoCompaction("threshold", false);

		expect(events.find((event) => event.type === "auto_compaction_end")).toMatchObject({
			type: "auto_compaction_end",
			aborted: false,
			result: { summary: "rollover summary" },
		});
		expect(session.sessionId).not.toBe(sourceId);
		expect(session.sessionFile).not.toBe(sourcePath);
		expect(session.agent.sessionId).toBe(session.sessionId);
		expect(session.backgroundTasks).toBe(backgroundTasks);
		expect(session.subagents).toBe(subagents);
		expect(events.some((event) => event.type === "session_path_changed")).toBe(true);
		await session.subagents?.spawn({ taskName: "after_rollover", message: "continue", agentType: "explorer" });
		expect(parentContexts[0]?.parentSessionId).toBe(session.sessionId);
		expect(parentContexts[0]?.parentSessionFile).toBe(session.sessionFile);
	});

	it("serializes concurrent identity transitions in FIFO order", async () => {
		const fixture = createIdentityFixture([]);
		const { session, tempDir } = fixture;
		const target = SessionManager.create(tempDir, tempDir);
		const targetPath = target.getSessionFile();
		target.close();
		if (!targetPath) throw new Error("Expected target session path");
		const entered = deferred();
		const release = deferred();
		let quiesceCalls = 0;
		const internals = session as unknown as {
			_ctx: { quiesceSessionIdentityResources(): Promise<void> };
		};
		const originalQuiesce = internals._ctx.quiesceSessionIdentityResources;
		internals._ctx.quiesceSessionIdentityResources = async () => {
			quiesceCalls++;
			if (quiesceCalls === 1) {
				entered.resolve();
				await release.promise;
			}
			await originalQuiesce();
		};

		const first = session.newSession();
		await entered.promise;
		const second = session.switchSession(targetPath);
		await Promise.resolve();
		expect(quiesceCalls).toBe(1);

		release.resolve();
		await Promise.all([first, second]);
		expect(quiesceCalls).toBe(2);
		expect(session.sessionFile).toBe(targetPath);
	});

	it("drains identity transitions admitted before close", async () => {
		const fixture = createIdentityFixture([]);
		const { session } = fixture;
		const entered = deferred();
		const release = deferred();
		let quiesceCalls = 0;
		const internals = session as unknown as {
			_ctx: { quiesceSessionIdentityResources(): Promise<void> };
		};
		const originalQuiesce = internals._ctx.quiesceSessionIdentityResources;
		internals._ctx.quiesceSessionIdentityResources = async () => {
			quiesceCalls++;
			if (quiesceCalls === 1) {
				entered.resolve();
				await release.promise;
			}
			await originalQuiesce();
		};

		const first = session.newSession();
		await entered.promise;
		const second = session.newSession();
		const closing = session.close();
		release.resolve();

		await Promise.all([first, second, closing]);
		expect(quiesceCalls).toBe(2);
	});

	it("keeps the committed target connected when setup fails after replacement", async () => {
		const fixture = createIdentityFixture([]);
		const { session } = fixture;
		const sourceId = session.sessionId;
		const internals = session as unknown as { _unsubscribeAgent?: () => void };

		await expect(
			session.newSession({
				setup: async () => {
					throw new Error("setup failed");
				},
			}),
		).rejects.toThrow("setup failed");
		expect(session.sessionId).not.toBe(sourceId);
		expect(internals._unsubscribeAgent).toBeTypeOf("function");
	});
});

function createIdentityFixture(handles: SubagentChildHandle[], options: IdentityFixtureOptions = {}): IdentityFixture {
	const tempDir = join(tmpdir(), `vetta-identity-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(tempDir, { recursive: true });
	tempDirs.push(tempDir);
	const agent = new Agent({
		getApiKey: () => "test-key",
		initialState: { model: TEST_MODEL, systemPrompt: "test", tools: [] },
	});
	const sessionManager = SessionManager.create(tempDir);
	const settingsManager = SettingsManager.create(tempDir, tempDir);
	const authStorage = AuthStorage.create(join(tempDir, "auth.json"));
	const modelRegistry = new ModelRegistry(authStorage, tempDir);
	const parentContexts: SubagentParentContext[] = [];
	let handleIndex = 0;
	const subagentSessionFactory: SubagentSessionFactory = {
		create: async (_request, parent) => {
			parentContexts.push(parent);
			const handle = handles[handleIndex++];
			if (!handle) throw new Error("Missing test child handle");
			return handle;
		},
	};
	const session = new AgentSession({
		agent,
		sessionManager,
		settingsManager,
		cwd: tempDir,
		modelRegistry,
		resourceLoader: createTestResourceLoader(),
		enableMcp: false,
		enableSubagents: true,
		subagentSessionFactory,
		...options,
	});
	sessions.push(session);
	return { session, sessionManager, tempDir, parentContexts };
}

function createHeldChild(held = true): HeldChild {
	const calls: string[] = [];
	let releasePrompt = () => {};
	const promptDone = new Promise<void>((resolve) => {
		releasePrompt = resolve;
	});
	const handle: SubagentChildHandle = {
		sessionId: `child-${Math.random().toString(36).slice(2)}`,
		prompt: async () => {
			if (held) await promptDone;
		},
		sendMessage: async () => {},
		followUp: async () => {},
		abort: () => {
			calls.push("abort");
			releasePrompt();
		},
		waitForIdle: async () => {
			calls.push("wait");
			if (held) await promptDone;
		},
		isStreaming: () => held,
		getLastAssistantText: () => undefined,
		dispose: vi.fn(),
		close: async () => {
			calls.push("close");
		},
		subscribe: () => () => {},
	};
	return { handle, calls };
}

function deferred(): Deferred {
	let resolve = () => {};
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

function heldProcessCommand(relativePidPath: string): string {
	if (process.platform === "win32") {
		return `$PID | Set-Content -LiteralPath '${relativePidPath}' -Encoding ascii; Start-Sleep -Seconds 60`;
	}
	return `printf '%s' "$$" > '${relativePidPath}'; sleep 60`;
}

function heldProcessCommandAt(pidPath: string): string {
	if (process.platform === "win32") {
		return `$PID | Set-Content -LiteralPath '${pidPath}' -Encoding ascii; Start-Sleep -Seconds 60`;
	}
	return `printf '%s' "$$" > '${pidPath}'; sleep 60`;
}

function createDeferredMcpTools(): AgentTool[] {
	return Array.from({ length: 16 }, (_, index): AgentTool => {
		const name = `mcp_identity_tool_${index}`;
		return {
			name,
			label: name,
			description: index === 15 ? "identity needle" : `unrelated capability ${index}`,
			parameters: Type.Object({}),
			execute: async () => ({ content: [{ type: "text", text: name }], details: {} }),
		};
	});
}

async function collectContinuationText(session: AgentSession): Promise<string | undefined> {
	const messages = await session.agent.continuationProvider?.();
	const message = messages?.[0];
	if (!message || !("content" in message)) return undefined;
	const content = message.content;
	if (!Array.isArray(content)) return undefined;
	const first = content[0];
	return first?.type === "text" ? first.text : undefined;
}

async function waitForPid(path: string): Promise<number> {
	const deadline = Date.now() + 5_000;
	while (Date.now() < deadline) {
		try {
			const pid = Number.parseInt((await readFile(path, "utf8")).trim(), 10);
			if (Number.isSafeInteger(pid) && pid > 0) return pid;
		} catch {
			// The command has not written its PID yet.
		}
		await new Promise<void>((resolve) => setTimeout(resolve, 25));
	}
	throw new Error(`Timed out waiting for background PID file: ${path}`);
}

function readBackgroundTaskId(details: unknown): string {
	if (typeof details !== "object" || details === null) throw new Error("Missing Bash tool details");
	const id = Reflect.get(details, "backgroundTaskId");
	if (typeof id !== "string") throw new Error("Missing background task id");
	return id;
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}
