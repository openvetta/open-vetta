import type { SessionEvent } from "@vetta/runtime-core";
import type { GenerationMetricsSnapshot } from "@vetta-org/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import {
	estimateTokens,
	GENERATION_METRICS_PUSH_INTERVAL_MS,
	GenerationMetricsHub,
	GenerationMetricsTracker,
} from "./plugin-generation-metrics";

const SESSION = "runtime-1";
const TURN = "turn-1";

function runtimeEvent(type: string, timestamp: number, fields: Record<string, unknown> = {}): SessionEvent {
	return {
		schemaVersion: 1,
		sessionId: SESSION,
		eventId: `${type}-${timestamp}`,
		timestamp,
		source: "agent",
		type,
		...fields,
	} as unknown as SessionEvent;
}

function assistantEvent(type: string, timestamp: number, fields: Record<string, unknown> = {}): SessionEvent {
	return {
		schemaVersion: 1,
		sessionId: SESSION,
		eventId: `${type}-${timestamp}`,
		timestamp,
		channel: "assistant",
		source: "agent",
		turnId: TURN,
		modelCallIndex: 0,
		type,
		...fields,
	} as unknown as SessionEvent;
}

function assistantMessage(output: number) {
	return {
		role: "assistant",
		content: [],
		provider: "anthropic",
		model: "claude-opus-5-5",
		usage: { input: 1200, output, cacheRead: 300, cacheWrite: 0, totalTokens: 1500 + output },
		stopReason: "stop",
		timestamp: 0,
	};
}

/** 一次完整的调用：t=0 发出请求，首字在 firstTokenAt，结束在 endedAt。 */
function playCall(
	tracker: GenerationMetricsTracker,
	options: { firstTokenAt: number; endedAt: number; deltas: string[]; output: number; modelCallIndex?: number },
): void {
	const modelCallIndex = options.modelCallIndex ?? 0;
	tracker.handle(runtimeEvent("model.request.started", options.firstTokenAt - 800, { turnId: TURN, modelCallIndex }));
	const step = (options.endedAt - options.firstTokenAt) / Math.max(1, options.deltas.length - 1);
	options.deltas.forEach((delta, index) => {
		tracker.handle(assistantEvent("text_delta", options.firstTokenAt + step * index, { delta, modelCallIndex }));
	});
	tracker.handle(
		assistantEvent("done", options.endedAt, {
			reason: "stop",
			message: assistantMessage(options.output),
			modelCallIndex,
		}),
	);
}

describe("estimateTokens", () => {
	it("counts CJK characters as one token each and other text at four characters per token", () => {
		expect(estimateTokens("你好世界")).toBe(4);
		expect(estimateTokens("abcdefgh")).toBe(2);
		expect(estimateTokens("改 bug")).toBe(2);
		expect(estimateTokens("")).toBe(0);
	});
});

describe("GenerationMetricsTracker", () => {
	it("measures time to first token from the request and speed from the first token using runtime timestamps", () => {
		const tracker = new GenerationMetricsTracker(SESSION, () => 99_999);
		tracker.handle(runtimeEvent("conversation.turn.started", 0, { turnId: TURN }));
		playCall(tracker, { firstTokenAt: 1_000, endedAt: 3_000, deltas: ["a".repeat(40), "b".repeat(40)], output: 80 });

		const snapshot = tracker.snapshot();
		expect(snapshot.phase).toBe("between-calls");
		expect(snapshot.call).toMatchObject({
			status: "done",
			requestedAt: 200,
			firstTokenAt: 1_000,
			endedAt: 3_000,
			timeToFirstTokenMs: 800,
			outputTokens: 80,
			tokensPerSecond: 40,
			estimated: false,
			model: { provider: "anthropic", id: "claude-opus-5-5" },
			usage: { input: 1200, output: 80, cacheRead: 300, cacheWrite: 0 },
		});
	});

	it("estimates output while streaming and reports the phase of what is being generated", () => {
		let now = 1_500;
		const tracker = new GenerationMetricsTracker(SESSION, () => now);
		tracker.handle(runtimeEvent("conversation.turn.started", 0, { turnId: TURN }));
		tracker.handle(runtimeEvent("model.request.started", 0, { turnId: TURN, modelCallIndex: 0 }));
		expect(tracker.snapshot().phase).toBe("waiting");

		tracker.handle(assistantEvent("thinking_delta", 500, { delta: "想".repeat(20) }));
		expect(tracker.snapshot().phase).toBe("thinking");
		tracker.handle(assistantEvent("text_delta", 1_000, { delta: "答".repeat(20) }));

		const streaming = tracker.snapshot();
		expect(streaming.phase).toBe("text");
		expect(streaming.call).toMatchObject({ status: "streaming", estimated: true, outputTokens: 40, usage: null });
		// 40 个估算 token，从首字 500ms 到此刻 1500ms。
		expect(streaming.call?.tokensPerSecond).toBe(40);

		now = 2_500;
		tracker.handle(assistantEvent("toolcall_delta", 2_500, { delta: '{"path":' }));
		expect(tracker.snapshot().phase).toBe("tool-args");
	});

	it("calibrates the next estimate with the previous call's reported usage", () => {
		const tracker = new GenerationMetricsTracker(SESSION, () => 0);
		tracker.handle(runtimeEvent("conversation.turn.started", 0, { turnId: TURN }));
		// 估算 40，provider 报 80：之后的估算乘 2。
		playCall(tracker, { firstTokenAt: 1_000, endedAt: 2_000, deltas: ["x".repeat(160)], output: 80 });
		tracker.handle(runtimeEvent("model.request.started", 2_100, { turnId: TURN, modelCallIndex: 1 }));
		tracker.handle(assistantEvent("text_delta", 2_200, { delta: "y".repeat(40), modelCallIndex: 1 }));

		expect(tracker.snapshot().call).toMatchObject({ modelCallIndex: 1, outputTokens: 20, estimated: true });
	});

	it("keeps the estimate when the provider reports zero output tokens", () => {
		const tracker = new GenerationMetricsTracker(SESSION, () => 0);
		tracker.handle(runtimeEvent("conversation.turn.started", 0, { turnId: TURN }));
		playCall(tracker, { firstTokenAt: 1_000, endedAt: 2_000, deltas: ["z".repeat(200)], output: 0 });

		expect(tracker.snapshot().call).toMatchObject({ status: "done", outputTokens: 50, estimated: true, usage: null });
	});

	it("sums a turn's model calls without counting time spent between them", () => {
		const tracker = new GenerationMetricsTracker(SESSION, () => 0);
		tracker.handle(runtimeEvent("conversation.turn.started", 0, { turnId: TURN }));
		playCall(tracker, { firstTokenAt: 1_000, endedAt: 2_000, deltas: ["a"], output: 30 });
		// 两次调用之间工具执行了 5 秒，不计入生成时长。
		playCall(tracker, { firstTokenAt: 8_000, endedAt: 9_000, deltas: ["b"], output: 50, modelCallIndex: 1 });
		tracker.handle(runtimeEvent("conversation.turn.completed", 9_100, { turnId: TURN, stopReason: "stop" }));

		const snapshot = tracker.snapshot();
		expect(snapshot.phase).toBe("idle");
		expect(snapshot.turn).toEqual({
			turnId: TURN,
			startedAt: 0,
			endedAt: 9_100,
			status: "completed",
			modelCalls: 2,
			outputTokens: 80,
			generationMs: 2_000,
			tokensPerSecond: 40,
			estimated: false,
		});
	});

	it("closes the in-flight call as aborted when the turn is cancelled", () => {
		const tracker = new GenerationMetricsTracker(SESSION, () => 0);
		tracker.handle(runtimeEvent("conversation.turn.started", 0, { turnId: TURN }));
		tracker.handle(runtimeEvent("model.request.started", 0, { turnId: TURN, modelCallIndex: 0 }));
		tracker.handle(assistantEvent("text_delta", 400, { delta: "half" }));
		tracker.handle(runtimeEvent("conversation.turn.cancelled", 900, { turnId: TURN }));

		const snapshot = tracker.snapshot();
		expect(snapshot.phase).toBe("idle");
		expect(snapshot.call).toMatchObject({ status: "aborted", endedAt: 900 });
		expect(snapshot.turn).toMatchObject({ status: "cancelled", endedAt: 900 });
	});

	it("does not report a speed for generations too short to measure", () => {
		const tracker = new GenerationMetricsTracker(SESSION, () => 0);
		tracker.handle(runtimeEvent("conversation.turn.started", 0, { turnId: TURN }));
		playCall(tracker, { firstTokenAt: 1_000, endedAt: 1_100, deltas: ["ok"], output: 2 });

		expect(tracker.snapshot().call?.tokensPerSecond).toBeNull();
	});

	it("reports the last two seconds as the recent speed and lets it fall to zero when the model stalls", () => {
		let now = 0;
		const tracker = new GenerationMetricsTracker(SESSION, () => now);
		tracker.handle(runtimeEvent("conversation.turn.started", 0, { turnId: TURN }));
		tracker.handle(runtimeEvent("model.request.started", 0, { turnId: TURN, modelCallIndex: 0 }));
		// 1s 起每 250ms 来 10 个估算 token，持续到 5s：稳定 40 tok/s。
		for (let at = 1_000; at <= 5_000; at += 250) {
			tracker.handle(assistantEvent("text_delta", at, { delta: "a".repeat(40) }));
		}

		now = 5_000;
		expect(tracker.snapshot().call).toMatchObject({ recentTokensPerSecond: 40, lastTokenAt: 5_000 });
		expect(tracker.snapshot().sampledAt).toBe(5_000);

		// 停了一秒：窗口 (4s, 6s] 里只有 4 批。
		now = 6_000;
		expect(tracker.snapshot().call?.recentTokensPerSecond).toBe(20);

		// 停够两秒：实时读数归零，平均速度只是慢慢往下掉。
		now = 7_500;
		const stalled = tracker.snapshot().call;
		expect(stalled?.recentTokensPerSecond).toBe(0);
		expect(stalled?.tokensPerSecond).toBeCloseTo(170 / 6.5, 5);
	});

	it("has no recent speed right after the first token or once the call has ended", () => {
		let now = 1_100;
		const tracker = new GenerationMetricsTracker(SESSION, () => now);
		tracker.handle(runtimeEvent("conversation.turn.started", 0, { turnId: TURN }));
		tracker.handle(runtimeEvent("model.request.started", 0, { turnId: TURN, modelCallIndex: 0 }));
		tracker.handle(assistantEvent("text_delta", 1_000, { delta: "a".repeat(40) }));
		expect(tracker.snapshot().call?.recentTokensPerSecond).toBeNull();

		tracker.handle(assistantEvent("done", 3_000, { reason: "stop", message: assistantMessage(10) }));
		now = 3_000;
		expect(tracker.snapshot().call?.recentTokensPerSecond).toBeNull();
	});

	it("starts timing from the first model event when it subscribed after the request went out", () => {
		const tracker = new GenerationMetricsTracker(SESSION, () => 0);
		tracker.handle(assistantEvent("text_delta", 1_000, { delta: "late" }));

		expect(tracker.snapshot().call).toMatchObject({
			requestedAt: null,
			firstTokenAt: 1_000,
			timeToFirstTokenMs: null,
		});
	});
});

function fakeTimers() {
	let now = 0;
	const pending: Array<{ at: number; callback: () => void }> = [];
	return {
		pending: () => pending.length,
		timers: {
			now: () => now,
			setTimeout: (callback: () => void, ms: number) => {
				const entry = { at: now + ms, callback };
				pending.push(entry);
				return entry;
			},
			clearTimeout: (handle: unknown) => {
				const index = pending.indexOf(handle as (typeof pending)[number]);
				if (index >= 0) pending.splice(index, 1);
			},
		},
		advance(ms: number) {
			now += ms;
			for (const entry of [...pending].sort((a, b) => a.at - b.at)) {
				if (entry.at > now) continue;
				pending.splice(pending.indexOf(entry), 1);
				entry.callback();
			}
		},
	};
}

describe("GenerationMetricsHub", () => {
	it("is unsupported without an active single-agent session", () => {
		const hub = new GenerationMetricsHub(fakeTimers().timers);
		expect(hub.getSnapshot()).toMatchObject({ supported: false, sessionId: null, call: null });
		hub.setActiveSession(SESSION);
		expect(hub.getSnapshot()).toMatchObject({ supported: true, sessionId: SESSION });
		hub.setActiveSession(null);
		expect(hub.getSnapshot().supported).toBe(false);
	});

	it("pushes phase changes immediately and coalesces deltas into one push per interval", () => {
		const clock = fakeTimers();
		const hub = new GenerationMetricsHub(clock.timers);
		const pushes: GenerationMetricsSnapshot[] = [];
		hub.subscribe((snapshot) => pushes.push(snapshot));
		hub.setActiveSession(SESSION);
		hub.handle(SESSION, runtimeEvent("conversation.turn.started", 0, { turnId: TURN }));
		hub.handle(SESSION, runtimeEvent("model.request.started", 0, { turnId: TURN, modelCallIndex: 0 }));
		hub.handle(SESSION, assistantEvent("text_delta", 10, { delta: "a" }));
		const afterPhaseChange = pushes.length;
		expect(pushes.at(-1)?.phase).toBe("text");

		for (let index = 0; index < 10; index++) {
			clock.advance(10);
			hub.handle(SESSION, assistantEvent("text_delta", 20 + index * 10, { delta: "b" }));
		}
		expect(pushes.length).toBe(afterPhaseChange);
		clock.advance(GENERATION_METRICS_PUSH_INTERVAL_MS);
		expect(pushes.length).toBe(afterPhaseChange + 1);

		hub.handle(SESSION, assistantEvent("done", 400, { reason: "stop", message: assistantMessage(12) }));
		expect(pushes.at(-1)?.call).toMatchObject({ status: "done", outputTokens: 12 });
	});

	it("keeps pushing while the model stalls so the live reading can fall, and stops once the call ends", () => {
		const clock = fakeTimers();
		const hub = new GenerationMetricsHub(clock.timers);
		const pushes: GenerationMetricsSnapshot[] = [];
		hub.subscribe((snapshot) => pushes.push(snapshot));
		hub.setActiveSession(SESSION);
		hub.handle(SESSION, runtimeEvent("conversation.turn.started", 0, { turnId: TURN }));
		hub.handle(SESSION, runtimeEvent("model.request.started", 0, { turnId: TURN, modelCallIndex: 0 }));
		hub.handle(SESSION, assistantEvent("text_delta", 0, { delta: "a".repeat(400) }));

		// 之后再没有事件：心跳照样推，读数从有到零。
		clock.advance(1_000);
		const duringStall = pushes.length;
		expect(pushes.at(-1)?.call?.recentTokensPerSecond).toBeGreaterThan(0);
		clock.advance(2_000);
		expect(pushes.length).toBeGreaterThan(duringStall);
		expect(pushes.at(-1)?.call?.recentTokensPerSecond).toBe(0);
		expect(pushes.at(-1)?.sampledAt).toBe(3_000);

		hub.handle(SESSION, assistantEvent("done", 3_000, { reason: "stop", message: assistantMessage(100) }));
		const afterEnd = pushes.length;
		clock.advance(5_000);
		expect(pushes.length).toBe(afterEnd);
	});

	it("does not heartbeat before the first token or after a minute without tokens", () => {
		const clock = fakeTimers();
		const hub = new GenerationMetricsHub(clock.timers);
		const pushes: GenerationMetricsSnapshot[] = [];
		hub.subscribe((snapshot) => pushes.push(snapshot));
		hub.setActiveSession(SESSION);
		hub.handle(SESSION, runtimeEvent("conversation.turn.started", 0, { turnId: TURN }));
		hub.handle(SESSION, runtimeEvent("model.request.started", 0, { turnId: TURN, modelCallIndex: 0 }));
		const waiting = pushes.length;
		clock.advance(3_000);
		expect(pushes.length).toBe(waiting);

		hub.handle(SESSION, assistantEvent("text_delta", 3_000, { delta: "a" }));
		// 漏了结束事件：一分钟后心跳停下。
		clock.advance(61_000);
		const stalled = pushes.length;
		clock.advance(10_000);
		expect(pushes.length).toBe(stalled);
	});

	it("only keeps the books while nobody is subscribed: no snapshots per delta and no heartbeat", () => {
		const clock = fakeTimers();
		const hub = new GenerationMetricsHub(clock.timers);
		const snapshot = vi.spyOn(GenerationMetricsTracker.prototype, "snapshot");
		try {
			hub.setActiveSession(SESSION);
			hub.handle(SESSION, runtimeEvent("conversation.turn.started", 0, { turnId: TURN }));
			hub.handle(SESSION, runtimeEvent("model.request.started", 0, { turnId: TURN, modelCallIndex: 0 }));
			for (let at = 100; at <= 2_000; at += 20) {
				clock.advance(20);
				hub.handle(SESSION, assistantEvent("text_delta", at, { delta: "a".repeat(40) }));
			}
			expect(snapshot).not.toHaveBeenCalled();
			expect(clock.pending()).toBe(0);

			// 有人来读时按需算一次，读到的是最新的账。
			expect(hub.getSnapshot()).toMatchObject({ phase: "text", call: { lastTokenAt: 2_000 } });
			expect(snapshot).toHaveBeenCalledTimes(1);
		} finally {
			snapshot.mockRestore();
		}
	});

	it("starts the heartbeat when the first plugin subscribes mid-stream and stops it when the last one leaves", () => {
		const clock = fakeTimers();
		const hub = new GenerationMetricsHub(clock.timers);
		hub.setActiveSession(SESSION);
		hub.handle(SESSION, runtimeEvent("model.request.started", 0, { turnId: TURN, modelCallIndex: 0 }));
		hub.handle(SESSION, assistantEvent("text_delta", 0, { delta: "a".repeat(400) }));
		expect(clock.pending()).toBe(0);

		const pushes: GenerationMetricsSnapshot[] = [];
		const unsubscribe = hub.subscribe((snapshot) => pushes.push(snapshot));
		expect(clock.pending()).toBe(1);
		clock.advance(GENERATION_METRICS_PUSH_INTERVAL_MS);
		expect(pushes).toHaveLength(1);

		unsubscribe();
		expect(clock.pending()).toBe(0);
	});

	it("ignores events from a session that is no longer active and restores a session's results when switching back", () => {
		const hub = new GenerationMetricsHub(fakeTimers().timers);
		hub.setActiveSession(SESSION);
		hub.handle(SESSION, runtimeEvent("conversation.turn.started", 0, { turnId: TURN }));
		hub.handle(SESSION, assistantEvent("done", 1_000, { reason: "stop", message: assistantMessage(20) }));
		hub.setActiveSession("runtime-2");
		hub.handle(SESSION, runtimeEvent("conversation.turn.started", 2_000, { turnId: "turn-2" }));
		expect(hub.getSnapshot()).toMatchObject({ sessionId: "runtime-2", call: null, turn: null });

		hub.setActiveSession(SESSION);
		expect(hub.getSnapshot()).toMatchObject({
			sessionId: SESSION,
			turn: { turnId: TURN },
			call: { outputTokens: 20 },
		});
	});
});
