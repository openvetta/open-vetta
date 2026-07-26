import type { AgentSessionState, SessionInput, TurnResult } from "./contracts.js";
import { sessionBusyError, sessionClosedError } from "./errors.js";
import type { TurnPipeline } from "./turn-pipeline.js";

export interface CreateAgentSessionOptions {
	readonly id: string;
	readonly pipeline: TurnPipeline;
}

export class AgentSession {
	readonly id: string;
	private readonly pipeline: TurnPipeline;
	private currentState: AgentSessionState = "idle";
	private activeController: AbortController | undefined;
	private activeTurn: Promise<TurnResult> | undefined;

	private constructor(options: CreateAgentSessionOptions) {
		this.id = options.id;
		this.pipeline = options.pipeline;
	}

	static async create(options: CreateAgentSessionOptions): Promise<AgentSession> {
		const session = new AgentSession(options);
		await options.pipeline.createSession(options.id);
		return session;
	}

	get state(): AgentSessionState {
		return this.currentState;
	}

	async send(input: SessionInput): Promise<TurnResult> {
		if (this.currentState === "closed" || this.currentState === "closing") {
			throw sessionClosedError();
		}
		if (this.currentState !== "idle") {
			throw sessionBusyError();
		}

		this.currentState = "running";
		const controller = new AbortController();
		this.activeController = controller;
		const turn = this.pipeline.run(this.id, input, controller.signal);
		this.activeTurn = turn;

		try {
			return await turn;
		} finally {
			this.finishActiveTurn();
		}
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
			this.currentState = "closed";
			return;
		}

		this.currentState = "closing";
		this.activeController?.abort("Session closed");
		await this.activeTurn;
		this.currentState = "closed";
	}

	private finishActiveTurn(): void {
		this.activeController = undefined;
		this.activeTurn = undefined;
		this.currentState = this.currentState === "closing" ? "closed" : "idle";
	}
}

export async function createAgentSession(options: CreateAgentSessionOptions): Promise<AgentSession> {
	return AgentSession.create(options);
}
