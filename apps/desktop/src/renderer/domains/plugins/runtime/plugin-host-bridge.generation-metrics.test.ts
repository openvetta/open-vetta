import type { SessionEvent } from "@vetta/runtime-core";
import type { GenerationMetricsSnapshot } from "@vetta-org/plugin-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const RUNTIME_STATE_KEY = "__vettaPluginHostBridgeRuntimeState_v2";
const METRICS_KEY = "__vettaPluginGenerationMetricsHub_v1";

// 事件桥读的是 jotai 默认 store，测试要用同一批 atom 实例才写得进去。
const atoms = await vi.hoisted(async () => {
	const { atom } = await import("jotai");
	return {
		activeSessionAtom: atom<{ runtimeId: string; cwd: string; sessionPath: string } | null>(null),
		activeSessionCwdAtom: atom(null),
		activeSessionPathAtom: atom(null),
		activeSessionRuntimeIdAtom: atom(null),
		chatMessagesAtom: atom([]),
		inputValueAtom: atom(""),
		isStreamingAtom: atom(false),
		languageAtom: atom("zh"),
		openSessionFnRef: { current: null },
		pluginConversationOverrideAtom: atom<{ id: string | null; cwd: string | null } | null>(null),
		promptAttachmentAtom: atom(null),
		selectedModelAtom: atom(null),
		sessionExecutionModeAtom: atom("workspace-write"),
	};
});

vi.mock("@shared/store/atoms", () => atoms);

const subscriptions = new Map<string, (event: SessionEvent) => void>();

beforeEach(() => {
	vi.resetModules();
	subscriptions.clear();
	const holder = globalThis as unknown as Record<string, unknown>;
	delete holder[RUNTIME_STATE_KEY];
	delete holder[METRICS_KEY];
	vi.stubGlobal("window", {
		vetta: {
			plugins: {
				onAgentToolRequest: () => () => undefined,
				onAgentHookRequest: () => () => undefined,
				onAgentHandlerReleased: () => () => undefined,
				onAppActionRequest: () => () => undefined,
				onAppActionCancel: () => () => undefined,
				onContinuationRequest: () => () => undefined,
				onSystemPromptRequest: () => () => undefined,
				onMediaProviderRequest: () => () => undefined,
				onOcrProviderRequest: () => () => undefined,
				onOcrProviderCancel: () => () => undefined,
			},
			session: {
				subscribe: async (runtimeId: string, listener: (event: SessionEvent) => void) => {
					subscriptions.set(runtimeId, listener);
					return () => subscriptions.delete(runtimeId);
				},
			},
		},
	});
});

function event(type: string, timestamp: number, fields: Record<string, unknown> = {}): SessionEvent {
	return {
		schemaVersion: 1,
		sessionId: "runtime-1",
		eventId: `${type}-${timestamp}`,
		timestamp,
		source: "agent",
		type,
		...fields,
	} as unknown as SessionEvent;
}

describe("plugin conversation bridge: generation metrics", () => {
	it("feeds the active session's events into the metrics plugins read", async () => {
		const { getDefaultStore } = await import("jotai");
		const store = getDefaultStore();
		store.set(atoms.pluginConversationOverrideAtom, null);
		store.set(atoms.activeSessionAtom, { runtimeId: "runtime-1", cwd: "/w", sessionPath: "/w/s.jsonl" });
		const bridge = await import("./plugin-host-bridge.js");
		bridge.installPluginHostBridge();

		const seen: GenerationMetricsSnapshot[] = [];
		bridge.pluginHostBridge.conversation.onGenerationMetrics((snapshot) => seen.push(snapshot));
		// 订阅即回放当前快照。
		await Promise.resolve();
		expect(seen.at(-1)).toMatchObject({ supported: true, sessionId: "runtime-1", phase: "idle" });

		await vi.waitFor(() => expect(subscriptions.has("runtime-1")).toBe(true));
		const emit = subscriptions.get("runtime-1");
		emit?.(event("conversation.turn.started", 0, { turnId: "t1" }));
		emit?.(event("model.request.started", 100, { turnId: "t1", modelCallIndex: 0 }));
		emit?.(event("text_delta", 600, { channel: "assistant", turnId: "t1", modelCallIndex: 0, delta: "hello world" }));

		expect(bridge.pluginHostBridge.conversation.getGenerationMetrics()).toMatchObject({
			phase: "text",
			call: { timeToFirstTokenMs: 500, estimated: true },
		});
	});

	it("reports metrics as unsupported in team conversations", async () => {
		const { getDefaultStore } = await import("jotai");
		const store = getDefaultStore();
		store.set(atoms.activeSessionAtom, { runtimeId: "runtime-1", cwd: "/w", sessionPath: "/w/s.jsonl" });
		store.set(atoms.pluginConversationOverrideAtom, null);
		const bridge = await import("./plugin-host-bridge.js");
		bridge.installPluginHostBridge();
		expect(bridge.pluginHostBridge.conversation.getGenerationMetrics().supported).toBe(true);

		// 团队会话没有单一 runtime：读数显示「不支持」，而不是残留上一个会话的数字。
		store.set(atoms.pluginConversationOverrideAtom, { id: "team-1", cwd: "/w/team" });

		expect(bridge.pluginHostBridge.conversation.getGenerationMetrics()).toMatchObject({
			supported: false,
			sessionId: null,
		});
	});
});
