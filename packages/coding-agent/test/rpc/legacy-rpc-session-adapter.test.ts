import type { Api, Model } from "@vetta/ai";
import { describe, expect, test, vi } from "vitest";
import type { AgentSession } from "../../src/core/agent-session.js";
import { LegacyRpcSessionAdapter } from "../../src/modes/rpc/legacy-rpc-session-adapter.js";
import type { RpcSessionInitialization } from "../../src/modes/rpc/rpc-session-capabilities.js";

describe("Legacy RPC session adapter", () => {
	test("projects legacy state and delegates model, memory and lifecycle behavior", async () => {
		const model = {
			provider: "provider",
			id: "model",
		} as unknown as Model<Api>;
		const session = createLegacySessionDouble(model);
		const adapter = new LegacyRpcSessionAdapter(session.value);

		await expect(adapter.state.readState()).resolves.toMatchObject({
			runtimeBackend: "legacy",
			model,
			thinkingLevel: "medium",
			sessionId: "session-1",
			sessionFile: "session.jsonl",
			messageCount: 0,
		});
		await expect(adapter.model.selectModel("provider", "model")).resolves.toBe(model);
		expect(session.setModel).toHaveBeenCalledWith(model);
		await expect(adapter.model.selectModel("provider", "missing")).resolves.toBeUndefined();
		await expect(adapter.memory.flushMemory()).resolves.toBe(2);

		const initialization = createInitialization();
		await adapter.initialize(initialization);
		expect(session.reconfigureCustomTools).toHaveBeenCalledOnce();
		expect(session.reconfigureCustomTools.mock.calls[0]?.[0]?.map((tool: { name: string }) => tool.name)).toEqual([
			"memory",
		]);
		expect(session.bindExtensions).toHaveBeenCalledOnce();
		adapter.commands.readCommands();
		expect(session.extensionRunner.getShortcuts).not.toHaveBeenCalled();
		expect(session.extensionRunner.getMessageRenderer).not.toHaveBeenCalled();

		const listener = vi.fn();
		const unsubscribe = adapter.subscribe(listener);
		expect(session.subscribe).toHaveBeenCalledWith(listener);
		unsubscribe();
		expect(session.unsubscribe).toHaveBeenCalledOnce();

		await adapter.shutdown();
		expect(session.extensionRunner.emit).toHaveBeenCalledWith({ type: "session_shutdown" });
		await adapter.dispose();
		expect(session.dispose).toHaveBeenCalledOnce();
	});
});

function createInitialization(): RpcSessionInitialization {
	return {
		uiContext: {} as RpcSessionInitialization["uiContext"],
		onShutdownRequested: vi.fn(),
		onExtensionError: vi.fn(),
	};
}

function createLegacySessionDouble(model: Model<Api>) {
	const unsubscribe = vi.fn();
	const setModel = vi.fn(async () => {});
	const reconfigureCustomTools = vi.fn();
	const bindExtensions = vi.fn(async () => {});
	const subscribe = vi.fn(() => unsubscribe);
	const dispose = vi.fn();
	const extensionRunner = {
		hasHandlers: vi.fn(() => true),
		emit: vi.fn(async () => {}),
		getRegisteredCommandsWithPaths: vi.fn(() => []),
		getShortcuts: vi.fn(() => new Map()),
		getMessageRenderer: vi.fn(() => undefined),
	};
	const value = {
		model,
		thinkingLevel: "medium",
		isStreaming: false,
		isCompacting: false,
		steeringMode: "all",
		followUpMode: "all",
		sessionFile: "session.jsonl",
		sessionId: "session-1",
		sessionName: "name",
		autoCompactionEnabled: true,
		messages: [],
		pendingMessageCount: 0,
		memoryMode: true,
		memoryFile: "MEMORY.md",
		memoryCharLimit: 4000,
		modelRegistry: {
			getAvailable: vi.fn(async () => [model]),
			isRemote: vi.fn(() => false),
		},
		setModel,
		flushMemory: vi.fn(async () => 2),
		reconfigureCustomTools,
		bindExtensions,
		subscribe,
		dispose,
		extensionRunner,
		agent: { waitForIdle: vi.fn(async () => {}) },
		newSession: vi.fn(async () => true),
		fork: vi.fn(async () => ({ selectedText: "", cancelled: false })),
		navigateTree: vi.fn(async () => ({ cancelled: false })),
		switchSession: vi.fn(async () => true),
		reload: vi.fn(async () => {}),
		promptTemplates: [],
		resourceLoader: {
			getSkills: vi.fn(() => ({ skills: [] })),
		},
	} as unknown as AgentSession;
	return {
		value,
		unsubscribe,
		setModel,
		reconfigureCustomTools,
		bindExtensions,
		subscribe,
		dispose,
		extensionRunner,
	};
}
