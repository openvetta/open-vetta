import { existsSync, mkdirSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent } from "@vetta/agent-core";
import type { Api, Model } from "@vetta/ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentSession } from "../src/core/agent-session.js";
import { AuthStorage } from "../src/core/auth-storage.js";
import { ModelRegistry } from "../src/core/model-registry.js";
import { SessionManager } from "../src/core/session-manager/index.js";
import { SettingsManager } from "../src/core/settings-manager.js";
import type {
	SubagentChildHandle,
	SubagentParentContext,
	SubagentSessionFactory,
} from "../src/core/subagents/types.js";
import { TODO_SNAPSHOT_TYPE } from "../src/core/todo-store.js";
import { assistantMsg, createTestResourceLoader, userMsg } from "./utilities.js";

interface HeldChild {
	readonly handle: SubagentChildHandle;
	readonly calls: string[];
}

interface IdentityFixture {
	readonly session: AgentSession;
	readonly sessionManager: SessionManager;
	readonly tempDir: string;
	readonly parentContexts: SubagentParentContext[];
}

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

	it("restores target Todo state on switch and rotates resources again on fork", async () => {
		const fixture = createIdentityFixture([]);
		const { session, sessionManager, tempDir } = fixture;
		session.todoStore.createMany(["source todo"]);

		const targetManager = SessionManager.create(tempDir);
		targetManager.appendMessage(userMsg("target history"));
		targetManager.appendMessage(assistantMsg("target answer"));
		targetManager.appendCustomEntry(TODO_SNAPSHOT_TYPE, {
			items: [{ id: 7, content: "target todo", status: "in_progress" }],
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
		expect(session.todoStore.getAll()).toEqual([{ id: 7, content: "target todo", status: "in_progress" }]);

		const entryId = sessionManager.appendMessage(userMsg("fork this turn"));
		session.agent.replaceMessages(sessionManager.buildSessionContext().messages);
		const switchedBackgroundTasks = session.backgroundTasks;
		await expect(session.fork(entryId)).resolves.toMatchObject({ cancelled: false });
		expect(session.backgroundTasks).not.toBe(switchedBackgroundTasks);
		expect(session.todoStore.getAll()).toEqual([{ id: 7, content: "target todo", status: "in_progress" }]);
	});
});

function createIdentityFixture(handles: SubagentChildHandle[]): IdentityFixture {
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

function heldProcessCommand(relativePidPath: string): string {
	if (process.platform === "win32") {
		return `$PID | Set-Content -LiteralPath '${relativePidPath}' -Encoding ascii; Start-Sleep -Seconds 60`;
	}
	return `printf '%s' "$$" > '${relativePidPath}'; sleep 60`;
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
