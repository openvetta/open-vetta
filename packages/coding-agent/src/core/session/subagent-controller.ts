import type { SubagentCoordinator } from "../subagents/coordinator.js";
import type { SubagentSnapshot, SubagentSpawnRequest, SubagentTypeId } from "../subagents/types.js";
import type { SessionOperationGate } from "./session-operation-gate.js";

/** Host-facing Subagent commands bound to one Session identity. */
export class SessionSubagentController {
	constructor(
		private readonly getCoordinator: () => SubagentCoordinator | undefined,
		private readonly gate: SessionOperationGate,
	) {}

	private current(): SubagentCoordinator {
		const coordinator = this.getCoordinator();
		if (!coordinator) throw new Error("Subagent coordinator is not active");
		return coordinator;
	}

	list(): ReadonlyArray<SubagentSnapshot> {
		return this.current().list();
	}

	get(target: string): SubagentSnapshot | undefined {
		return this.current().get(target);
	}

	rebindParentSession(parentSessionId: string, parentSessionFile?: string): void {
		this.gate.runImmediateSessionOperation(() =>
			this.current().rebindParentSession(parentSessionId, parentSessionFile),
		);
	}

	clearFinished(): number {
		return this.gate.runImmediateSessionOperation(() => this.current().clearFinished());
	}

	registeredTypeIds(): readonly SubagentTypeId[] {
		return this.current().registeredTypeIds();
	}

	typeDocs(): string {
		return this.current().typeDocs();
	}

	spawn(request: SubagentSpawnRequest): Promise<SubagentSnapshot> {
		return this.gate.startSessionOperation(() => this.current().spawn(request));
	}

	spawnMany(requests: SubagentSpawnRequest[]): SubagentSnapshot[] {
		return this.gate.runImmediateSessionOperation(() => this.current().spawnMany(requests));
	}

	sendMessage(target: string, message: string): Promise<SubagentSnapshot> {
		return this.gate.startSessionOperation(() => this.current().sendMessage(target, message));
	}

	followUp(target: string, message: string): Promise<SubagentSnapshot> {
		return this.gate.startSessionOperation(() => this.current().followUp(target, message));
	}

	interrupt(target: string): SubagentSnapshot {
		return this.current().interrupt(target);
	}

	wait(options?: {
		targets?: string[];
		timeoutMs?: number;
	}): Promise<{ timedOut: boolean; agents: SubagentSnapshot[] }> {
		return this.current().wait(options);
	}

	dispose(): Promise<void> {
		return this.current().dispose();
	}
}
