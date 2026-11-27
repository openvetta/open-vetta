import type { SessionEvent } from "@vetta/runtime-core";
import type {
	GenerationCallMetrics,
	GenerationMetricsSnapshot,
	GenerationPhase,
	GenerationTokenUsage,
	GenerationTurnMetrics,
} from "@vetta-org/plugin-sdk";

/**
 * 插件可读的生成指标（Plugin API 2.12）：把一个会话的 SessionEvent 折算成首字延迟、tok/s 与用量。
 *
 * 只用运行时打在事件上的时间戳，不用渲染进程收到事件的时刻——后者混进了 IPC 与批量派发的抖动。
 * 生成中 provider 还没报 usage，只能按字符估算 token；同一会话上一次调用结束后，用「真实 / 估算」
 * 的比值校准下一次估算，模型和语言固定时估算会越来越贴近。
 */

/** 生成时长不到这个值时速度没有意义（一两个 chunk 就能除出几千 tok/s）。 */
const MIN_SPEED_WINDOW_MS = 250;
/** 近期速度的窗口：两秒足够平滑 chunk 的颗粒，又能在一两秒内反映停顿。 */
const RECENT_WINDOW_MS = 2_000;
/** 校准只采信足够长的调用，太短的调用比值噪声大。 */
const MIN_CALIBRATION_ESTIMATE = 20;
const CALIBRATION_MIN = 0.25;
const CALIBRATION_MAX = 4;

// 中日韩文字和全角符号大致一字一 token；其余（拉丁字母、代码、空白）大致四字一 token。
const WIDE_CHAR = /[⺀-鿿가-힯豈-﫿＀-￯]/gu;

export function estimateTokens(text: string): number {
	if (!text) return 0;
	const wide = text.match(WIDE_CHAR)?.length ?? 0;
	return wide + (text.length - wide) / 4;
}

interface CallState {
	turnId: string | null;
	modelCallIndex: number;
	model: { provider: string; id: string } | null;
	status: GenerationCallMetrics["status"];
	requestedAt: number | null;
	firstTokenAt: number | null;
	lastDeltaAt: number | null;
	endedAt: number | null;
	estimate: number;
	/** 增量到达时刻与当时的累计估算，只保留近期窗口用得到的那几条。 */
	samples: Array<{ at: number; estimate: number }>;
	/** 调用开始那一刻的校准值：同一次调用的读数不会在结束前被别的调用的校准改写。 */
	calibration: number;
	usage: GenerationTokenUsage | null;
	streamKind: "thinking" | "text" | "tool-args" | null;
}

interface TurnState {
	turnId: string;
	startedAt: number;
	endedAt: number | null;
	status: GenerationTurnMetrics["status"];
	calls: CallState[];
}

function speed(tokens: number, from: number | null, to: number | null): number | null {
	if (from === null || to === null) return null;
	const ms = to - from;
	if (ms < MIN_SPEED_WINDOW_MS || tokens <= 0) return null;
	return tokens / (ms / 1000);
}

function usageFromMessage(message: unknown): GenerationTokenUsage | null {
	const usage = (message as { usage?: Partial<GenerationTokenUsage> } | undefined)?.usage;
	if (!usage || typeof usage.output !== "number") return null;
	return {
		input: usage.input ?? 0,
		output: usage.output,
		cacheRead: usage.cacheRead ?? 0,
		cacheWrite: usage.cacheWrite ?? 0,
	};
}

function modelFromMessage(message: unknown): CallState["model"] {
	const value = message as { provider?: unknown; model?: unknown } | undefined;
	if (typeof value?.provider !== "string" || typeof value.model !== "string") return null;
	return { provider: value.provider, id: value.model };
}

export class GenerationMetricsTracker {
	private call: CallState | null = null;
	private turn: TurnState | null = null;
	/** 「provider 报的输出 token / 本地估算」，用于校准下一次估算。 */
	private calibration = 1;

	constructor(
		readonly sessionId: string,
		private readonly now: () => number = Date.now,
	) {}

	/** 处理一条事件；返回快照是否可能变化。 */
	handle(event: SessionEvent): boolean {
		if (event.channel === "assistant") return this.handleAssistant(event);
		switch (event.type) {
			case "conversation.turn.started":
				this.turn = {
					turnId: event.turnId,
					startedAt: event.timestamp,
					endedAt: null,
					status: "running",
					calls: [],
				};
				return true;
			case "conversation.turn.completed":
				return this.endTurn(event.turnId, event.timestamp, "completed");
			case "conversation.turn.cancelled":
				return this.endTurn(event.turnId, event.timestamp, "cancelled");
			case "conversation.turn.failed":
				return this.endTurn(event.turnId, event.timestamp, "failed");
			case "model.request.started":
				this.beginCall(event.turnId, event.modelCallIndex, event.timestamp);
				return true;
			case "session.lifecycle":
				// 中止时运行时不一定还会发 turn 终态，这里兜底把仍在生成的调用收掉。
				if (event.phase === "aborted") return this.endTurn(this.turn?.turnId ?? null, event.timestamp, "cancelled");
				return false;
			default:
				return false;
		}
	}

	private handleAssistant(event: Extract<SessionEvent, { channel: "assistant" }>): boolean {
		const at = event.timestamp;
		switch (event.type) {
			case "start": {
				const call = this.ensureCall(event.turnId ?? null, event.modelCallIndex, at);
				call.model ??= modelFromMessage(event.partial);
				return true;
			}
			case "thinking_delta":
			case "text_delta":
			case "toolcall_delta": {
				const call = this.ensureCall(event.turnId ?? null, event.modelCallIndex, at);
				call.firstTokenAt ??= at;
				call.lastDeltaAt = at;
				call.estimate += estimateTokens(event.delta);
				call.samples.push({ at, estimate: call.estimate });
				// 留一条落在窗口起点之前的样本，作为窗口内增量的基准。
				while (call.samples.length > 2 && (call.samples[1]?.at ?? at) <= at - RECENT_WINDOW_MS)
					call.samples.shift();
				call.streamKind =
					event.type === "thinking_delta" ? "thinking" : event.type === "text_delta" ? "text" : "tool-args";
				return true;
			}
			case "done":
			case "error": {
				const message = event.type === "done" ? event.message : event.error;
				const call = this.ensureCall(event.turnId ?? null, event.modelCallIndex, at);
				call.model = modelFromMessage(message) ?? call.model;
				call.endedAt = at;
				call.status = event.type === "done" ? "done" : event.reason === "aborted" ? "aborted" : "error";
				call.streamKind = null;
				// 近期速度只在生成中有值，结束后样本没用了。
				call.samples = [];
				const usage = usageFromMessage(message);
				// 有些 provider 不报 usage，报回来的是全 0：当作没报，保持估算。
				call.usage = usage && usage.output > 0 ? usage : null;
				if (call.usage && call.estimate >= MIN_CALIBRATION_ESTIMATE) {
					const ratio = call.usage.output / call.estimate;
					this.calibration = Math.min(CALIBRATION_MAX, Math.max(CALIBRATION_MIN, ratio));
				}
				return true;
			}
			default:
				return false;
		}
	}

	private beginCall(turnId: string | null, modelCallIndex: number, at: number): CallState {
		const call: CallState = {
			turnId,
			modelCallIndex,
			model: null,
			status: "streaming",
			requestedAt: at,
			firstTokenAt: null,
			lastDeltaAt: null,
			endedAt: null,
			estimate: 0,
			samples: [],
			calibration: this.calibration,
			usage: null,
			streamKind: null,
		};
		this.call = call;
		if (this.turn && (turnId === null || this.turn.turnId === turnId)) this.turn.calls.push(call);
		return call;
	}

	private ensureCall(turnId: string | null, modelCallIndex: number, at: number): CallState {
		const current = this.call;
		if (current && current.status === "streaming" && current.modelCallIndex === modelCallIndex) {
			if (turnId === null || current.turnId === null || current.turnId === turnId) return current;
		}
		// 没收到 model.request.started（订阅晚于请求发出）：从第一条模型事件起算，请求时刻未知。
		const call = this.beginCall(turnId, modelCallIndex, at);
		call.requestedAt = null;
		return call;
	}

	private endTurn(turnId: string | null, at: number, status: GenerationTurnMetrics["status"]): boolean {
		let changed = false;
		if (this.call?.status === "streaming") {
			this.call.status = "aborted";
			this.call.endedAt = at;
			this.call.streamKind = null;
			this.call.samples = [];
			changed = true;
		}
		if (this.turn && this.turn.endedAt === null && (turnId === null || this.turn.turnId === turnId)) {
			this.turn.endedAt = at;
			this.turn.status = status;
			changed = true;
		}
		return changed;
	}

	/**
	 * 「读数含义」的指纹：阶段、调用、轮次状态任一变化都要立即推送。只读几个字段，
	 * 不构建快照——它在每个流式增量上都要跑一次。
	 */
	stateKey(): string {
		const call = this.call;
		return `${this.phase()}|${call?.modelCallIndex ?? ""}|${call?.status ?? ""}|${this.turn?.status ?? ""}`;
	}

	/** 是否值得心跳：首字后仍在生成，且停顿不超过上限（再久多半是漏了结束事件）。 */
	wantsHeartbeat(now: number): boolean {
		const call = this.call;
		return (
			call?.status === "streaming" && call.lastDeltaAt !== null && now - call.lastDeltaAt < HEARTBEAT_STALL_LIMIT_MS
		);
	}

	snapshot(): GenerationMetricsSnapshot {
		const now = this.now();
		return {
			supported: true,
			sampledAt: now,
			sessionId: this.sessionId,
			phase: this.phase(),
			call: this.call ? this.callMetrics(this.call, now) : null,
			turn: this.turn ? this.turnMetrics(this.turn, now) : null,
		};
	}

	private phase(): GenerationPhase {
		const call = this.call;
		if (call?.status === "streaming") return call.streamKind ?? "waiting";
		if (this.turn?.endedAt === null) return "between-calls";
		return "idle";
	}

	private callMetrics(call: CallState, now: number): GenerationCallMetrics {
		const estimated = call.usage === null;
		const outputTokens = call.usage ? call.usage.output : Math.round(call.estimate * call.calibration);
		// 生成中以「此刻」为终点：停顿时平均速度缓慢下降、近期速度降到 0（hub 的心跳负责按时重算）。
		const end = call.endedAt ?? (call.firstTokenAt === null ? null : Math.max(now, call.lastDeltaAt ?? now));
		return {
			turnId: call.turnId,
			modelCallIndex: call.modelCallIndex,
			model: call.model,
			status: call.status,
			requestedAt: call.requestedAt,
			firstTokenAt: call.firstTokenAt,
			lastTokenAt: call.lastDeltaAt,
			endedAt: call.endedAt,
			timeToFirstTokenMs:
				call.requestedAt !== null && call.firstTokenAt !== null ? call.firstTokenAt - call.requestedAt : null,
			outputTokens,
			tokensPerSecond: speed(outputTokens, call.firstTokenAt, end),
			recentTokensPerSecond: this.recentSpeed(call, end),
			estimated,
			usage: call.usage,
		};
	}

	/** 最近窗口内的估算速度。窗口里没有新增量就是 0，这正是「停住了」该显示的。 */
	private recentSpeed(call: CallState, end: number | null): number | null {
		if (call.status !== "streaming" || call.firstTokenAt === null || end === null) return null;
		const windowStart = Math.max(call.firstTokenAt, end - RECENT_WINDOW_MS);
		const windowMs = end - windowStart;
		if (windowMs < MIN_SPEED_WINDOW_MS) return null;
		let base = 0;
		for (const sample of call.samples) {
			if (sample.at > windowStart) break;
			base = sample.estimate;
		}
		// 窗口从首字起算时，首字那一批也算进窗口（与平均速度的口径一致）。
		if (windowStart === call.firstTokenAt) base = 0;
		const tokens = (call.estimate - base) * call.calibration;
		return tokens / (windowMs / 1000);
	}

	private turnMetrics(turn: TurnState, now: number): GenerationTurnMetrics {
		let outputTokens = 0;
		let generationMs = 0;
		let estimated = false;
		for (const state of turn.calls) {
			const call = this.callMetrics(state, now);
			outputTokens += call.outputTokens;
			estimated ||= call.estimated && call.outputTokens > 0;
			if (call.firstTokenAt !== null) generationMs += Math.max(0, (call.endedAt ?? now) - call.firstTokenAt);
		}
		return {
			turnId: turn.turnId,
			startedAt: turn.startedAt,
			endedAt: turn.endedAt,
			status: turn.status,
			modelCalls: turn.calls.length,
			outputTokens,
			generationMs,
			tokensPerSecond:
				generationMs >= MIN_SPEED_WINDOW_MS && outputTokens > 0 ? outputTokens / (generationMs / 1000) : null,
			estimated,
		};
	}
}

/** 生成中推送的最小间隔：读数每秒刷新四次足够，再快只是让每个订阅的插件陪着重渲。 */
export const GENERATION_METRICS_PUSH_INTERVAL_MS = 250;
/** 停顿超过这么久就不再心跳：多半是漏了结束事件，没必要让订阅的插件一直每秒重渲四次。 */
const HEARTBEAT_STALL_LIMIT_MS = 60_000;
/** 切走的会话保留多少个：切回来还能看到它上一轮的结算。 */
const MAX_REMEMBERED_SESSIONS = 20;

const UNSUPPORTED: GenerationMetricsSnapshot = Object.freeze({
	supported: false,
	sampledAt: 0,
	sessionId: null,
	phase: "idle",
	call: null,
	turn: null,
}) as GenerationMetricsSnapshot;

interface HubTimers {
	now(): number;
	setTimeout(callback: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

const defaultTimers: HubTimers = {
	now: () => Date.now(),
	setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
	clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * 当前活动会话的指标出口：按会话缓存追踪器，限频后推给插件。
 *
 * 读数（`getSnapshot`）是缓存的不可变对象，只在推送时更新，`useSyncExternalStore` 据此判定是否重渲。
 * 阶段切换、调用结束、切会话这类「读数含义变了」的时刻立即推送，其余增量合并到下一个间隔；
 * 生成中没有事件也按间隔推送（心跳），停顿才看得出来。
 *
 * 没有订阅者时（绝大多数用户没装这类插件）只记账：不构建快照、不心跳，
 * 有人来读时才按需算一次。
 */
export class GenerationMetricsHub {
	private readonly trackers = new Map<string, GenerationMetricsTracker>();
	private active: GenerationMetricsTracker | null = null;
	private readonly listeners = new Set<(snapshot: GenerationMetricsSnapshot) => void>();
	private current: GenerationMetricsSnapshot = UNSUPPORTED;
	/** 记过账但还没重算快照。 */
	private dirty = false;
	private timer: unknown = null;
	private lastPushAt = Number.NEGATIVE_INFINITY;

	constructor(private readonly timers: HubTimers = defaultTimers) {}

	/** 活动会话变了。`null` 表示没有会话或团队会话（没有单一 runtime，暂不提供指标）。 */
	setActiveSession(runtimeId: string | null): void {
		if ((this.active?.sessionId ?? null) === runtimeId) return;
		this.active = runtimeId ? this.trackerFor(runtimeId) : null;
		this.dirty = true;
		if (this.listeners.size > 0) this.push();
		else this.cancelTimer();
	}

	/** 活动会话的一条事件。 */
	handle(runtimeId: string, event: SessionEvent): void {
		const tracker = this.active;
		if (tracker?.sessionId !== runtimeId) return;
		if (this.listeners.size === 0) {
			if (tracker.handle(event)) this.dirty = true;
			return;
		}
		const before = tracker.stateKey();
		if (!tracker.handle(event)) return;
		this.dirty = true;
		if (tracker.stateKey() !== before) this.push();
		else this.schedule();
	}

	getSnapshot = (): GenerationMetricsSnapshot => {
		// 有订阅者时只返回推送过的那份，保证同一帧里多次读取拿到同一个对象。
		// 没有订阅者（命令式读取、hook 首次渲染）时按需重算：有新账，或生成中距上次已过一个间隔。
		if (this.listeners.size === 0 && this.isStale()) this.refresh();
		return this.current;
	};

	subscribe = (listener: (snapshot: GenerationMetricsSnapshot) => void): (() => void) => {
		this.listeners.add(listener);
		if (this.listeners.size === 1) {
			if (this.isStale()) this.refresh();
			this.scheduleHeartbeat();
		}
		return () => {
			this.listeners.delete(listener);
			if (this.listeners.size === 0) this.cancelTimer();
		};
	};

	private isStale(): boolean {
		if (this.dirty) return true;
		const now = this.timers.now();
		return this.active?.wantsHeartbeat(now) === true && now - this.lastPushAt >= GENERATION_METRICS_PUSH_INTERVAL_MS;
	}

	private trackerFor(runtimeId: string): GenerationMetricsTracker {
		let tracker = this.trackers.get(runtimeId);
		if (tracker) {
			this.trackers.delete(runtimeId);
		} else {
			tracker = new GenerationMetricsTracker(runtimeId, this.timers.now);
		}
		this.trackers.set(runtimeId, tracker);
		while (this.trackers.size > MAX_REMEMBERED_SESSIONS) {
			const oldest = this.trackers.keys().next().value;
			if (oldest === undefined) break;
			this.trackers.delete(oldest);
		}
		return tracker;
	}

	private schedule(): void {
		if (this.timer !== null || this.listeners.size === 0) return;
		const wait = Math.max(0, this.lastPushAt + GENERATION_METRICS_PUSH_INTERVAL_MS - this.timers.now());
		if (wait === 0) {
			this.push();
			return;
		}
		this.timer = this.timers.setTimeout(() => {
			this.timer = null;
			this.push();
		}, wait);
	}

	/** 生成中即使没有新事件也按间隔重算：模型停顿时近期速度要降下来，而不是冻在上一个值。首字之前读数不会变，不心跳。 */
	private scheduleHeartbeat(): void {
		if (this.active?.wantsHeartbeat(this.timers.now())) this.schedule();
	}

	private cancelTimer(): void {
		if (this.timer === null) return;
		this.timers.clearTimeout(this.timer);
		this.timer = null;
	}

	private refresh(): void {
		this.current = this.active?.snapshot() ?? UNSUPPORTED;
		this.dirty = false;
		this.lastPushAt = this.timers.now();
	}

	private push(): void {
		this.cancelTimer();
		this.refresh();
		for (const listener of this.listeners) {
			try {
				listener(this.current);
			} catch (error) {
				console.error("Plugin generation metrics listener threw", error);
			}
		}
		this.scheduleHeartbeat();
	}
}
