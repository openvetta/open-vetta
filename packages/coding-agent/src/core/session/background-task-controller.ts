import type {
	BackgroundTaskEndedBy,
	BackgroundTaskListener,
	BackgroundTaskManager,
	BackgroundTaskSnapshot,
	SpawnBackgroundTaskOptions,
} from "../background-tasks/index.js";
import type { SessionOperationGate } from "./session-operation-gate.js";

/** Host-facing background-task commands bound to one Session identity. */
export class SessionBackgroundTaskController {
	constructor(
		private readonly manager: BackgroundTaskManager,
		private readonly gate: SessionOperationGate,
	) {}

	get onNotify(): ((task: BackgroundTaskSnapshot) => void) | undefined {
		return this.manager.onNotify;
	}

	set onNotify(listener: ((task: BackgroundTaskSnapshot) => void) | undefined) {
		this.manager.onNotify = listener;
	}

	subscribe(listener: BackgroundTaskListener): () => void {
		return this.manager.subscribe(listener);
	}

	spawn(options: SpawnBackgroundTaskOptions): BackgroundTaskSnapshot {
		return this.gate.runImmediateSessionOperation(() => this.manager.spawn(options));
	}

	wait(
		taskId: string,
		options: { maxMs: number; signal?: AbortSignal },
	): Promise<{ stillRunning: boolean; snapshot: BackgroundTaskSnapshot }> {
		return this.manager.wait(taskId, options);
	}

	get(taskId: string): BackgroundTaskSnapshot | undefined {
		return this.manager.get(taskId);
	}

	list(): BackgroundTaskSnapshot[] {
		return this.manager.list();
	}

	get runningCount(): number {
		return this.manager.runningCount;
	}

	consumeReadOffset(taskId: string): { offset: number; end: number } | undefined {
		return this.manager.consumeReadOffset(taskId);
	}

	kill(taskId: string, reason?: BackgroundTaskEndedBy): boolean {
		return this.manager.kill(taskId, reason);
	}

	clearFinished(): number {
		return this.gate.runImmediateSessionOperation(() => this.manager.clearFinished());
	}

	killAll(): void {
		this.manager.killAll();
	}

	shutdown(options: { timeoutMs?: number } = {}): Promise<void> {
		return this.manager.shutdown(options);
	}
}
