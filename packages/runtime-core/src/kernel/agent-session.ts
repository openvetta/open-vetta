import type {
	AgentSessionState,
	QueuedSessionInputResult,
	SessionContextRecord,
	SessionInput,
	SessionInputQueueMode,
	SessionSendOptions,
	SessionSendResult,
	SessionStreamingBehavior,
	TurnResult,
	TurnSessionIdentity,
} from "./contracts.js";
import { sessionBusyError, sessionClosedError } from "./errors.js";
import { type ClearedSessionInputs, SessionInputQueue } from "./session-input-queue.js";
import type { TurnPipeline } from "./turn-pipeline.js";

export interface CreateAgentSessionOptions {
	readonly id: string;
	readonly pipeline: TurnPipeline;
	readonly steeringMode?: SessionInputQueueMode;
	readonly followUpMode?: SessionInputQueueMode;
}

export class AgentSession {
	private readonly identity: MutableTurnSessionIdentity;
	private readonly pipeline: TurnPipeline;
	private readonly inputQueue: SessionInputQueue;
	private currentState: AgentSessionState = "idle";
	private activeController: AbortController | undefined;
	private activeTurn: Promise<TurnResult> | undefined;
	private continuationRequested = false;
	private continuationDrain: Promise<void> | undefined;
	private readonly continuationContext: SessionContextRecord[] = [];
	private readonly continuationWaiters: Array<{
		resolve(): void;
		reject(error: unknown): void;
	}> = [];

	private constructor(options: CreateAgentSessionOptions) {
		this.identity = new MutableTurnSessionIdentity(options.id);
		this.pipeline = options.pipeline;
		this.inputQueue = new SessionInputQueue({
			steeringMode: options.steeringMode,
			followUpMode: options.followUpMode,
		});
	}

	static async create(options: CreateAgentSessionOptions): Promise<AgentSession> {
		const session = new AgentSession(options);
		await options.pipeline.createSession(options.id);
		return session;
	}

	static async resume(options: CreateAgentSessionOptions): Promise<AgentSession> {
		const session = new AgentSession(options);
		await options.pipeline.resumeSession(options.id);
		return session;
	}

	get state(): AgentSessionState {
		return this.currentState;
	}

	get id(): string {
		return this.identity.sessionId;
	}

	get pendingMessageCount(): number {
		return this.inputQueue.pendingCount;
	}

	getSteeringMessages(): readonly SessionInput["message"][] {
		return this.inputQueue.steeringInputs.map((input) => input.message);
	}

	getFollowUpMessages(): readonly SessionInput["message"][] {
		return this.inputQueue.followUpInputs.map((input) => input.message);
	}

	get steeringMode(): SessionInputQueueMode {
		return this.inputQueue.steeringMode;
	}

	get followUpMode(): SessionInputQueueMode {
		return this.inputQueue.followUpMode;
	}

	setSteeringMode(mode: SessionInputQueueMode): void {
		this.inputQueue.setSteeringMode(mode);
	}

	setFollowUpMode(mode: SessionInputQueueMode): void {
		this.inputQueue.setFollowUpMode(mode);
	}

	async send(input: SessionInput): Promise<TurnResult>;
	async send(input: SessionInput, options: SessionSendOptions): Promise<SessionSendResult>;
	async send(input: SessionInput, options: SessionSendOptions = {}): Promise<SessionSendResult> {
		if (this.currentState === "closed" || this.currentState === "closing") {
			throw sessionClosedError();
		}
		if (this.currentState !== "idle") {
			if (!options.streamingBehavior) throw sessionBusyError();
			return this.queueInput(options.streamingBehavior, input);
		}

		return this.startTurn(input);
	}

	async continue(): Promise<TurnResult> {
		if (this.currentState === "closed" || this.currentState === "closing") {
			throw sessionClosedError();
		}
		if (this.currentState !== "idle") throw sessionBusyError();
		return this.startTurn();
	}

	/**
	 * 请求一次异步续跑。
	 *
	 * 与显式 continue 不同：活动 Turn 期间到达的多个请求会合并，并在当前 Turn
	 * 完成后串行启动一次 continuation。后台任务和子代理通知使用该入口唤醒
	 * 空闲 Session，避免绕过 Session 的并发状态机。
	 */
	requestContinuation(context: readonly SessionContextRecord[] = []): Promise<void> {
		if (this.currentState === "closed" || this.currentState === "closing") {
			return Promise.reject(sessionClosedError());
		}
		this.continuationRequested = true;
		this.continuationContext.push(...context);
		const completion = new Promise<void>((resolve, reject) => {
			this.continuationWaiters.push({ resolve, reject });
		});
		this.scheduleRequestedContinuations();
		return completion;
	}

	steer(input: SessionInput): QueuedSessionInputResult {
		return this.queueInput("steer", input);
	}

	followUp(input: SessionInput): QueuedSessionInputResult {
		return this.queueInput("followUp", input);
	}

	clearQueue(): ClearedSessionInputs {
		return this.inputQueue.clear();
	}

	async cancel(reason?: string): Promise<void> {
		if (this.currentState !== "running" && this.currentState !== "cancelling") return;
		this.currentState = "cancelling";
		this.activeController?.abort(reason);
		await this.activeTurn;
	}

	async close(): Promise<void> {
		if (this.currentState === "closed") return;
		if (!this.activeTurn) {
			this.inputQueue.clear();
			this.currentState = "closed";
			this.rejectContinuationWaiters(sessionClosedError());
			return;
		}

		this.currentState = "closing";
		this.activeController?.abort("Session closed");
		await this.activeTurn;
		this.inputQueue.clear();
		this.currentState = "closed";
		this.rejectContinuationWaiters(sessionClosedError());
	}

	private queueInput(behavior: SessionStreamingBehavior, input: SessionInput): QueuedSessionInputResult {
		if (this.currentState === "closed" || this.currentState === "closing") {
			throw sessionClosedError();
		}
		return {
			status: "queued",
			behavior,
			pendingCount: this.inputQueue.enqueue(behavior, input),
		};
	}

	private async startTurn(
		input?: SessionInput,
		continuationContext: readonly SessionContextRecord[] = [],
	): Promise<TurnResult> {
		this.currentState = "running";
		const controller = new AbortController();
		this.activeController = controller;
		const turn = input
			? this.pipeline.run(this.identity, input, controller.signal, this.inputQueue)
			: this.pipeline.continue(this.identity, controller.signal, this.inputQueue, continuationContext);
		this.activeTurn = turn;

		try {
			return await turn;
		} finally {
			this.finishActiveTurn();
		}
	}

	private async drainRequestedContinuations(): Promise<void> {
		while (this.continuationRequested && this.currentState === "idle") {
			this.continuationRequested = false;
			const waiters = this.continuationWaiters.splice(0);
			const context = this.continuationContext.splice(0);
			try {
				await this.startTurn(undefined, context);
				for (const waiter of waiters) waiter.resolve();
			} catch (error) {
				for (const waiter of waiters) waiter.reject(error);
			}
		}
	}

	private finishActiveTurn(): void {
		this.activeController = undefined;
		this.activeTurn = undefined;
		this.currentState = this.currentState === "closing" ? "closed" : "idle";
		this.scheduleRequestedContinuations();
	}

	private scheduleRequestedContinuations(): void {
		if (!this.continuationRequested || this.continuationDrain) return;
		if (this.currentState === "closed" || this.currentState === "closing") {
			this.rejectContinuationWaiters(sessionClosedError());
			return;
		}
		if (this.currentState !== "idle") return;
		this.continuationDrain = this.drainRequestedContinuations();
		void this.continuationDrain.then(() => {
			this.continuationDrain = undefined;
			if (this.continuationRequested) this.scheduleRequestedContinuations();
		});
	}

	private rejectContinuationWaiters(error: unknown): void {
		this.continuationRequested = false;
		this.continuationContext.length = 0;
		for (const waiter of this.continuationWaiters.splice(0)) waiter.reject(error);
	}
}

class MutableTurnSessionIdentity implements TurnSessionIdentity {
	private currentSessionId: string;

	constructor(sessionId: string) {
		this.currentSessionId = sessionId;
	}

	get sessionId(): string {
		return this.currentSessionId;
	}

	transition(sessionId: string): void {
		if (!sessionId) throw new Error("Conversation continuation requires a target session ID");
		this.currentSessionId = sessionId;
	}
}

export async function createAgentSession(options: CreateAgentSessionOptions): Promise<AgentSession> {
	return AgentSession.create(options);
}

export async function resumeAgentSession(options: CreateAgentSessionOptions): Promise<AgentSession> {
	return AgentSession.resume(options);
}
