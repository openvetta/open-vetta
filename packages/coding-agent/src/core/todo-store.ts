/**
 * TodoStore — in-memory todo list with session JSONL persistence.
 *
 * Storage strategy:
 * - Runtime: items kept in a plain array (fast reads)
 * - Persistence: on every mutation a "todo_snapshot" CustomEntry is appended
 *   to the SessionManager so it survives process restarts
 * - Recovery: on session resume, replay the latest todo_snapshot entry
 */

export interface TodoItem {
	id: number;
	content: string;
	status: "pending" | "in_progress" | "done";
}

export type TodoSnapshot = TodoItem[];

export type TodoUpdateListener = (items: ReadonlyArray<TodoItem>) => void;

export const TODO_SNAPSHOT_TYPE = "todo_snapshot";

export class TodoStore {
	private items: TodoItem[] = [];
	private nextId = 1;
	private listeners: Set<TodoUpdateListener> = new Set();
	/** Optional callback to persist snapshot to session JSONL */
	private persistFn?: (snapshot: TodoSnapshot) => void;

	/**
	 * @param persistFn Called on every mutation to write a snapshot to session JSONL.
	 */
	constructor(persistFn?: (snapshot: TodoSnapshot) => void) {
		this.persistFn = persistFn;
	}

	/** Replace persist function (e.g., after session switch). */
	setPersistFn(fn: (snapshot: TodoSnapshot) => void): void {
		this.persistFn = fn;
	}

	// ── Queries ──────────────────────────────────────────────

	getAll(): ReadonlyArray<TodoItem> {
		return this.items;
	}

	get(id: number): TodoItem | undefined {
		return this.items.find((t) => t.id === id);
	}

	// ── Mutations ─────────────────────────────────────────────

	/** Create multiple items at once. Returns created items. */
	createMany(contents: string[]): TodoItem[] {
		const created: TodoItem[] = [];
		for (const content of contents) {
			const item: TodoItem = { id: this.nextId++, content, status: "pending" };
			this.items.push(item);
			created.push(item);
		}
		this._afterMutation();
		return created;
	}

	/** Update status of one item. Returns the updated item or undefined if not found. */
	update(id: number, status: TodoItem["status"]): TodoItem | undefined {
		const item = this.items.find((t) => t.id === id);
		if (!item) return undefined;
		item.status = status;
		this._afterMutation();
		return item;
	}

	/** Clear all items and reset ID counter. */
	clear(): void {
		this.items = [];
		this.nextId = 1;
		this._afterMutation();
	}

	// ── Restore from snapshot ─────────────────────────────────

	/** Restore state from a persisted snapshot (e.g., on session resume). */
	restoreFromSnapshot(snapshot: TodoSnapshot): void {
		this.items = snapshot.map((item) => ({ ...item }));
		this.nextId = this.items.length > 0 ? Math.max(...this.items.map((t) => t.id)) + 1 : 1;
		this._notify();
	}

	// ── Subscriptions ─────────────────────────────────────────

	subscribe(listener: TodoUpdateListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	// ── Internal ──────────────────────────────────────────────

	private _afterMutation(): void {
		this._persist();
		this._notify();
	}

	private _persist(): void {
		this.persistFn?.(this.items.map((item) => ({ ...item })));
	}

	private _notify(): void {
		for (const listener of this.listeners) {
			try {
				listener(this.items);
			} catch {
				// Ignore listener errors
			}
		}
	}
}
