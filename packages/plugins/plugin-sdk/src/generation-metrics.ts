/**
 * 生成指标：当前活动会话里模型「生成得多快」的宿主口径（Plugin API `^2.12.0`）。
 *
 * 数字由宿主算好再交给插件，插件只负责展示：时间戳来自运行时（不是插件收到事件的时刻），
 * token 数来自 provider 报回的 usage。这样不同插件、以及插件与宿主自己的界面之间，算出来是同一个口径。
 *
 * 口径（文档 `conversation-and-agent.md#生成指标` 同步维护）：
 * - 首字延迟 = 首个任何类型的增量（正文 / 思考 / 工具参数）− 请求发出；
 * - 生成速度 = 输出 token ÷ （结束或此刻 − 首字），分母不含排队与首字前的等待；
 * - 近期速度 = 最近 2 秒内的输出 token ÷ 2 秒（不足 2 秒按首字以来算），只在生成中有值，停顿时降到 0；
 * - 生成中 provider 还没报 usage，输出 token 是按已收到的字符估算的（`estimated: true`），
 *   结束后换成 provider 报的真实值；provider 不报 usage 时一直保持估算。
 */

/** 此刻在做什么。只描述「模型在不在生成、在生成什么」，不描述工具执行本身。 */
export type GenerationPhase =
	/** 没有进行中的轮次。 */
	| "idle"
	/** 请求已发出，还没收到第一个增量（排队、首字延迟、或 provider 不流式下发思考）。 */
	| "waiting"
	/** 正在输出思考内容。 */
	| "thinking"
	/** 正在输出正文。 */
	| "text"
	/** 正在输出工具调用参数（写大文件时整段生成都在这里）。 */
	| "tool-args"
	/** 轮次进行中，但两次模型调用之间没有在生成（通常是工具在执行）。 */
	| "between-calls";

/** provider 报回的 token 用量。缓存读写与输入互不重叠。 */
export interface GenerationTokenUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

/** 一次模型调用（一轮里可能有多次：每次工具调用后模型会再被调用一次）。 */
export interface GenerationCallMetrics {
	/** 所属轮次；宿主拿不到轮次身份时为 null。 */
	turnId: string | null;
	/** 轮内第几次模型调用，从 0 开始。 */
	modelCallIndex: number;
	model: { provider: string; id: string } | null;
	status: "streaming" | "done" | "error" | "aborted";
	/** 请求发出的时刻（ms）；运行时没有上报时为 null。 */
	requestedAt: number | null;
	/** 首个增量到达的时刻（ms）；还没有时为 null。 */
	firstTokenAt: number | null;
	/** 最近一个增量到达的时刻（ms）；还没有时为 null。生成中用它判断「停顿了多久」。 */
	lastTokenAt: number | null;
	/** 结束时刻（ms）；仍在生成时为 null。 */
	endedAt: number | null;
	timeToFirstTokenMs: number | null;
	/** 输出 token 数；`estimated` 为 true 时是估算值。 */
	outputTokens: number;
	/** 首字以来的平均生成速度；生成时长太短（< 250ms）或还没有首字时为 null。适合做结算。 */
	tokensPerSecond: number | null;
	/**
	 * 最近 2 秒的生成速度（估算），适合做实时读数：模型停顿时会降到 0，而平均速度只会缓慢下降。
	 * 只在 `status === "streaming"` 且首字后至少 250ms 时有值，其余为 null。
	 */
	recentTokensPerSecond: number | null;
	/** `outputTokens` / `tokensPerSecond` 是否为估算值。 */
	estimated: boolean;
	/** provider 报回的完整用量；生成中、或 provider 不报时为 null。 */
	usage: GenerationTokenUsage | null;
}

/** 一轮的汇总：轮内所有模型调用相加。 */
export interface GenerationTurnMetrics {
	turnId: string;
	startedAt: number;
	/** 轮次结束时刻；进行中为 null。 */
	endedAt: number | null;
	status: "running" | "completed" | "cancelled" | "failed";
	modelCalls: number;
	outputTokens: number;
	/** 各次调用「首字到结束」相加，不含工具执行与等待首字的时间。 */
	generationMs: number;
	tokensPerSecond: number | null;
	/** 只要有一次调用是估算的，汇总就是估算的。 */
	estimated: boolean;
}

export interface GenerationMetricsSnapshot {
	/**
	 * 宿主能否为当前会话提供指标。没有活动会话、团队会话时为 false，
	 * 此时其余字段为空，插件应隐藏读数而不是显示 0。
	 */
	supported: boolean;
	/** 这份快照的计算时刻（ms），与其余时间戳同一时钟；不支持时为 0。 */
	sampledAt: number;
	/** 当前活动会话的 runtime id，与 `ConversationState.id` 一致。 */
	sessionId: string | null;
	phase: GenerationPhase;
	/** 正在进行的那次模型调用；没有就是这个会话最近一次结束的调用。 */
	call: GenerationCallMetrics | null;
	/** 正在进行的那一轮；没有就是这个会话最近一次结束的轮次。 */
	turn: GenerationTurnMetrics | null;
}

/** 宿主不提供指标时的快照。 */
export const UNSUPPORTED_GENERATION_METRICS: GenerationMetricsSnapshot = Object.freeze({
	supported: false,
	sampledAt: 0,
	sessionId: null,
	phase: "idle",
	call: null,
	turn: null,
}) as GenerationMetricsSnapshot;
