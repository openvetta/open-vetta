import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AgentSession } from "../src/core/agent-session.js";
import { AuthStorage } from "../src/core/auth-storage.js";
import { ModelRegistry } from "../src/core/model-registry.js";
import type { ResourceLoader } from "../src/core/resource-loader.js";
import { createLegacyExtensionExecutionHost } from "../src/core/session/extension-binding.js";
import type { SessionContext } from "../src/core/session/session-context.js";
import { SessionManager } from "../src/core/session-manager/index.js";
import {
	bindExtensionRuntimeActions,
	createExtensionRuntime,
	type ExtensionActions,
	type ExtensionContextActions,
	type ExtensionExecutionHost,
	ExtensionRunner,
} from "../src/extensions/index.js";

describe("ExtensionExecutionHost", () => {
	it("原位绑定完整命令式动作并保留 Loader 共享状态", () => {
		const runtime = createExtensionRuntime();
		runtime.flagValues.set("feature", true);
		runtime.pendingProviderRegistrations.push({
			name: "provider",
			config: { baseUrl: "https://example.invalid" },
		});
		const actions = createActions();

		bindExtensionRuntimeActions(runtime, actions);

		expect(runtime.sendMessage).toBe(actions.sendMessage);
		expect(runtime.sendUserMessage).toBe(actions.sendUserMessage);
		expect(runtime.appendEntry).toBe(actions.appendEntry);
		expect(runtime.setSessionName).toBe(actions.setSessionName);
		expect(runtime.getSessionName).toBe(actions.getSessionName);
		expect(runtime.setLabel).toBe(actions.setLabel);
		expect(runtime.getActiveTools).toBe(actions.getActiveTools);
		expect(runtime.getAllTools).toBe(actions.getAllTools);
		expect(runtime.setActiveTools).toBe(actions.setActiveTools);
		expect(runtime.getCommands).toBe(actions.getCommands);
		expect(runtime.setModel).toBe(actions.setModel);
		expect(runtime.getThinkingLevel).toBe(actions.getThinkingLevel);
		expect(runtime.setThinkingLevel).toBe(actions.setThinkingLevel);
		expect(runtime.flagValues.get("feature")).toBe(true);
		expect(runtime.pendingProviderRegistrations).toHaveLength(1);
	});

	it("Runner 通过 Host 合同绑定 Runtime 与动态 Context 动作", () => {
		const runtime = createExtensionRuntime();
		const actions = createActions();
		const contextActions = createContextActions();
		const host: ExtensionExecutionHost = { actions, contextActions };
		const runner = new ExtensionRunner(
			[],
			runtime,
			process.cwd(),
			SessionManager.inMemory(),
			new ModelRegistry(AuthStorage.inMemory(), join(tmpdir(), "missing-extension-host-models.json")),
		);

		runner.bindExecutionHost(host);
		const context = runner.createContext();

		expect(runtime.getSessionName()).toBe("session");
		expect(context.isIdle()).toBe(false);
		expect(context.hasPendingMessages()).toBe(true);
		expect(context.getContextUsage()).toEqual({
			tokens: 25,
			contextWindow: 100,
			percent: 25,
		});
		expect(context.getSystemPrompt()).toBe("system");

		context.abort();
		context.shutdown();
		context.compact();
		expect(contextActions.abort).toHaveBeenCalledOnce();
		expect(contextActions.shutdown).toHaveBeenCalledOnce();
		expect(contextActions.compact).toHaveBeenCalledOnce();
	});

	it("Legacy 适配保留持久化映射和异步发送错误上报", async () => {
		const runtime = createExtensionRuntime();
		const sessionManager = SessionManager.inMemory();
		const modelRegistry = new ModelRegistry(
			AuthStorage.inMemory(),
			join(tmpdir(), "missing-extension-legacy-host-models.json"),
		);
		const runner = new ExtensionRunner([], runtime, process.cwd(), sessionManager, modelRegistry);
		const sendCustomMessage = vi.fn().mockRejectedValue(new Error("send failed"));
		const sendUserMessage = vi.fn().mockResolvedValue(undefined);
		const setThinkingLevel = vi.fn();
		const abort = vi.fn().mockResolvedValue(undefined);
		const shutdown = vi.fn();
		const errors: Array<{ extensionPath: string; event: string; error: string }> = [];
		runner.onError((error) => errors.push(error));
		const host = {
			sendCustomMessage,
			sendUserMessage,
			thinkingLevel: "medium",
			setThinkingLevel,
			pendingMessageCount: 1,
			getContextUsage: () => ({ tokens: 10, contextWindow: 100, percent: 10 }),
			compact: vi.fn(),
			setModel: vi.fn(),
		} as unknown as AgentSession;
		const context = {
			sessionManager,
			modelRegistry,
			model: undefined,
			agent: { state: { isStreaming: false, systemPrompt: "legacy-system" } },
			abort,
		} as unknown as SessionContext;
		const resourceLoader = {
			getPrompts: () => ({ prompts: [], diagnostics: [] }),
			getSkills: () => ({ skills: [], diagnostics: [] }),
		} as unknown as ResourceLoader;
		const executionHost = createLegacyExtensionExecutionHost(runner, {
			ctx: context,
			host,
			resourceLoader,
			getActiveTools: () => ["read"],
			getAllTools: () => [],
			setActiveTools: vi.fn(),
			getShutdownHandler: () => shutdown,
		});

		executionHost.actions.appendEntry("checkpoint", { value: 1 });
		const targetId = sessionManager.getEntries()[0]?.id;
		expect(targetId).toBeDefined();
		executionHost.actions.setSessionName("named");
		executionHost.actions.setLabel(targetId ?? "", "label");
		executionHost.actions.sendMessage({
			customType: "notice",
			content: "content",
			display: true,
		});
		executionHost.actions.sendUserMessage("hello");

		expect(executionHost.actions.getSessionName()).toBe("named");
		expect(sessionManager.getLabel(targetId ?? "")).toBe("label");
		expect(executionHost.actions.getActiveTools()).toEqual(["read"]);
		expect(executionHost.contextActions.hasPendingMessages()).toBe(true);
		expect(executionHost.contextActions.getSystemPrompt()).toBe("legacy-system");
		await vi.waitFor(() => {
			expect(errors).toEqual([
				{
					extensionPath: "<runtime>",
					event: "send_message",
					error: "send failed",
				},
			]);
		});
		expect(sendUserMessage).toHaveBeenCalledWith("hello", undefined);
	});
});

function createActions(): ExtensionActions {
	return {
		sendMessage: vi.fn(),
		sendUserMessage: vi.fn(),
		appendEntry: vi.fn(),
		setSessionName: vi.fn(),
		getSessionName: () => "session",
		setLabel: vi.fn(),
		getActiveTools: () => ["read"],
		getAllTools: () => [],
		setActiveTools: vi.fn(),
		getCommands: () => [],
		setModel: async () => true,
		getThinkingLevel: () => "medium",
		setThinkingLevel: vi.fn(),
	};
}

function createContextActions(): ExtensionContextActions {
	return {
		getModel: () => undefined,
		isIdle: () => false,
		abort: vi.fn(),
		hasPendingMessages: () => true,
		shutdown: vi.fn(),
		getContextUsage: () => ({
			tokens: 25,
			contextWindow: 100,
			percent: 25,
		}),
		compact: vi.fn(),
		getSystemPrompt: () => "system",
	};
}
