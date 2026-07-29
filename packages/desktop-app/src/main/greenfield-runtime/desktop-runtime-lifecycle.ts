export type DesktopRuntimeLifecycleState = "idle" | "running" | "stopping" | "stopped";

export class DesktopRuntimeLifecycle {
	private currentState: DesktopRuntimeLifecycleState = "idle";

	get state(): DesktopRuntimeLifecycleState {
		return this.currentState;
	}

	assertCanAccessRuntime(): void {
		if (this.currentState === "stopping" || this.currentState === "stopped") {
			throw new Error(`Desktop RuntimeHost is ${this.currentState}`);
		}
	}

	markRunning(): void {
		this.assertCanAccessRuntime();
		this.currentState = "running";
	}

	beginShutdown(): void {
		if (this.currentState === "stopping" || this.currentState === "stopped") return;
		this.currentState = "stopping";
	}

	markStopped(): void {
		this.currentState = "stopped";
	}
}
