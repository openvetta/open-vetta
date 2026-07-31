import type {
	QueuedSessionInput,
	SessionContextRecord,
	SessionInput,
	SessionInputQueueMode,
	SessionStreamingBehavior,
	TurnInputQueue,
} from "./contracts.js";

export interface SessionInputQueueOptions {
	readonly steeringMode?: SessionInputQueueMode;
	readonly followUpMode?: SessionInputQueueMode;
}

export interface ClearedSessionInputs {
	readonly steering: readonly SessionInput[];
	readonly followUps: readonly SessionInput[];
}

export class SessionInputQueue implements TurnInputQueue {
	private readonly steeringQueue: QueuedSessionInput[] = [];
	private readonly followUpQueue: QueuedSessionInput[] = [];
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
		return this.steeringQueue.filter(isSessionInput);
	}

	get followUpInputs(): readonly SessionInput[] {
		return this.followUpQueue.filter(isSessionInput);
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

	enqueueContext(behavior: SessionStreamingBehavior, context: readonly SessionContextRecord[]): number {
		const input = { context } satisfies QueuedSessionInput;
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
		return this.takeSteeringInputs().flatMap((input) => (input.message ? [input.message] : []));
	}

	takeFollowUps(): readonly SessionInput["message"][] {
		return this.takeFollowUpInputs().flatMap((input) => (input.message ? [input.message] : []));
	}

	takeSteeringInputs(): readonly QueuedSessionInput[] {
		return this.take(this.steeringQueue, this.currentSteeringMode);
	}

	takeFollowUpInputs(): readonly QueuedSessionInput[] {
		return this.take(this.followUpQueue, this.currentFollowUpMode);
	}

	enqueueFollowUps(messages: readonly SessionInput["message"][]): void {
		for (const message of messages) {
			this.followUpQueue.push({ message });
		}
	}

	clear(): ClearedSessionInputs {
		const steering = this.steeringQueue.splice(0);
		const followUps = this.followUpQueue.splice(0);
		return {
			steering: steering.filter(isSessionInput),
			followUps: followUps.filter(isSessionInput),
		};
	}

	private take(queue: QueuedSessionInput[], mode: SessionInputQueueMode): readonly QueuedSessionInput[] {
		if (mode === "all") return queue.splice(0);
		const input = queue.shift();
		return input ? [input] : [];
	}
}

function isSessionInput(input: QueuedSessionInput): input is SessionInput {
	return input.message !== undefined;
}
