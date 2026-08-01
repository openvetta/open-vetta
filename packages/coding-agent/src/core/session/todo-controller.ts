import type { TodoItem, TodoLockSource, TodoStore, TodoUpdateListener } from "../todo-store.js";
import type { SessionOperationGate } from "./session-operation-gate.js";

/** Host-facing Todo commands; persistence ownership remains inside AgentSession. */
export class SessionTodoController {
	constructor(
		private readonly store: TodoStore,
		private readonly gate: SessionOperationGate,
	) {}

	getAll(): ReadonlyArray<TodoItem> {
		return this.store.getAll().map((item) => ({ ...item }));
	}

	get(id: number): TodoItem | undefined {
		const item = this.store.get(id);
		return item ? { ...item } : undefined;
	}

	isLocked(): boolean {
		return this.store.isLocked();
	}

	getLockSource(): TodoLockSource | null {
		return this.store.getLockSource();
	}

	createMany(contents: string[]): TodoItem[] {
		return this.gate.runImmediateSessionOperation(() => this.store.createMany(contents).map((item) => ({ ...item })));
	}

	update(id: number, status: TodoItem["status"]): TodoItem | undefined {
		return this.gate.runImmediateSessionOperation(() => {
			const item = this.store.update(id, status);
			return item ? { ...item } : undefined;
		});
	}

	clear(): void {
		this.gate.runImmediateSessionOperation(() => this.store.clear());
	}

	lock(source: TodoLockSource): void {
		this.gate.runImmediateSessionOperation(() => this.store.lock(source));
	}

	subscribe(listener: TodoUpdateListener): () => void {
		return this.store.subscribe((items) => listener(items.map((item) => ({ ...item }))));
	}
}
