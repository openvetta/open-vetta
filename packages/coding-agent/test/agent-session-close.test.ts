import { describe, expect, it, vi } from "vitest";
import { AgentSession } from "../src/core/agent-session.js";

interface Deferred {
	readonly promise: Promise<void>;
	readonly resolve: () => void;
}

interface CloseInternals {
	_unsubscribeAgent?: () => void;
	_eventListeners: unknown[];
	_subagents?: { dispose(): Promise<void> };
	_retry: { abortRetry(): void };
	_compaction: { quiesceSessionIdentity(): Promise<void> };
	_nav: { abortBranchSummary(): void; closeAdmission(): Promise<void> };
	_bash: { quiesceSessionIdentity(): Promise<void> };
	_hookRuntime: { runSessionEnd(reason: "dispose"): Promise<void> };
	_backgroundTasks: { shutdown(): Promise<void> };
	_runtime: { close(): Promise<void> };
	agent: { abort(): void; waitForIdle(): Promise<void> };
	sessionManager: { close(): void };
}

function deferred(): Deferred {
	let resolve = () => {};
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

describe("AgentSession close transaction", () => {
	it("is idempotent and releases session ownership after all resources are quiet", async () => {
		const identityTransition = deferred();
		const idle = deferred();
		const hooks = deferred();
		const subagents = deferred();
		const background = deferred();
		const runtime = deferred();
		const closeLock = vi.fn();
		const closeRuntime = vi.fn(() => runtime.promise);
		const closeBackground = vi.fn(() => background.promise);
		const unsubscribe = vi.fn();

		const session = Object.create(AgentSession.prototype) as AgentSession;
		const internals = session as unknown as CloseInternals;
		internals._unsubscribeAgent = unsubscribe;
		internals._eventListeners = [vi.fn()];
		internals._subagents = { dispose: () => subagents.promise };
		internals._retry = { abortRetry: vi.fn() };
		internals._compaction = { quiesceSessionIdentity: vi.fn(async () => {}) };
		internals._nav = { abortBranchSummary: vi.fn(), closeAdmission: () => identityTransition.promise };
		internals._bash = { quiesceSessionIdentity: vi.fn(async () => {}) };
		internals._hookRuntime = { runSessionEnd: () => hooks.promise };
		internals._backgroundTasks = { shutdown: closeBackground };
		internals._runtime = { close: closeRuntime };
		internals.agent = { abort: vi.fn(), waitForIdle: () => idle.promise };
		internals.sessionManager = { close: closeLock };

		const first = session.close();
		expect(session.close()).toBe(first);
		expect(unsubscribe).toHaveBeenCalledOnce();
		expect(internals._eventListeners).toEqual([]);
		expect(closeRuntime).not.toHaveBeenCalled();
		expect(closeLock).not.toHaveBeenCalled();
		expect(closeBackground).not.toHaveBeenCalled();

		identityTransition.resolve();
		idle.resolve();
		hooks.resolve();
		subagents.resolve();
		background.resolve();
		await vi.waitFor(() => expect(closeRuntime).toHaveBeenCalledOnce());
		expect(closeLock).not.toHaveBeenCalled();

		runtime.resolve();
		await first;
		expect(closeLock).toHaveBeenCalledOnce();
	});

	it("attempts every cleanup, releases ownership, and rejects when a critical resource cannot close", async () => {
		const closeLock = vi.fn();
		const closeRuntime = vi.fn(async () => {});
		const session = Object.create(AgentSession.prototype) as AgentSession;
		const internals = session as unknown as CloseInternals;
		internals._eventListeners = [];
		internals._retry = { abortRetry: vi.fn() };
		internals._compaction = { quiesceSessionIdentity: vi.fn(async () => {}) };
		internals._nav = { abortBranchSummary: vi.fn(), closeAdmission: async () => {} };
		internals._bash = { quiesceSessionIdentity: vi.fn(async () => {}) };
		internals._hookRuntime = { runSessionEnd: async () => {} };
		internals._backgroundTasks = {
			shutdown: async () => {
				throw new Error("pid 42 remained");
			},
		};
		internals._runtime = { close: closeRuntime };
		internals.agent = { abort: vi.fn(), waitForIdle: async () => {} };
		internals.sessionManager = { close: closeLock };

		await expect(session.close()).rejects.toThrow(/failed to close all owned resources/);
		expect(closeRuntime).toHaveBeenCalledOnce();
		expect(closeLock).toHaveBeenCalledOnce();
	});
});
