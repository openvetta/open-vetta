import type { SessionInput, SessionInputQueueMode, SessionStreamingBehavior, TurnInputQueue } from "./contracts.js";

export interface SessionInputQueueOptions {
	readonly steeringMode?: SessionInputQueueMode;
	readonly followUpMode?: SessionInputQueueMode;
}

export interface ClearedSessionInputs {
	readonly steering: readonly SessionInput[];
	readonly followUps: readonly SessionInput[];
}

export class SessionInputQueue implements TurnInputQueue {
	private readonly steeringQueue: SessionInput[] = [];
	private readonly followUpQueue: SessionInput[] = [];
	private currentSteeringMode: SessionInputQueueMode;
	private currentFollowUpMode: SessionInputQueueMode;

	constructor(options: SessionInputQueueOptions = {}) {
		this.currentSteeringMode = options.steeringMode ?? "one-at-a-time";
		this.currentFollowUpMode = options.followUpMode ?? "one-at-a-time";
	}

	get pendingCount(): number {
		return this.steeringQueue.length + this.followUpQueue.length;
	}

	get steeringInputs(): readonly SessionInput[] {
		return [...this.steeringQueue];
	}

	get followUpInputs(): readonly SessionInput[] {
		return [...this.followUpQueue];
	}

	get steeringMode(): SessionInputQueueMode {
		return this.currentSteeringMode;
	}

	get followUpMode(): SessionInputQueueMode {
		return this.currentFollowUpMode;
	}

	setSteeringMode(mode: SessionInputQueueMode): void {
		this.currentSteeringMode = mode;
	}

	setFollowUpMode(mode: SessionInputQueueMode): void {
		this.currentFollowUpMode = mode;
	}

	enqueue(behavior: SessionStreamingBehavior, input: SessionInput): number {
		if (behavior === "steer") {
			this.steeringQueue.push(input);
		} else {
			this.followUpQueue.push(input);
		}
		return this.pendingCount;
	}

	steer(input: SessionInput): number {
		return this.enqueue("steer", input);
	}

	followUp(input: SessionInput): number {
		return this.enqueue("followUp", input);
	}

	takeSteering(): readonly SessionInput["message"][] {
		return this.take(this.steeringQueue, this.currentSteeringMode).map((input) => input.message);
	}

	takeFollowUps(): readonly SessionInput["message"][] {
		return this.take(this.followUpQueue, this.currentFollowUpMode).map((input) => input.message);
	}

	clear(): ClearedSessionInputs {
		return {
			steering: this.steeringQueue.splice(0),
			followUps: this.followUpQueue.splice(0),
		};
	}

	private take(queue: SessionInput[], mode: SessionInputQueueMode): readonly SessionInput[] {
		if (mode === "all") return queue.splice(0);
		const input = queue.shift();
		return input ? [input] : [];
	}
}
