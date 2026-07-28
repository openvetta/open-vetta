import { randomUUID } from "node:crypto";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type {
	ConversationDocument,
	GreenfieldRuntimeDocumentParticipant,
	GreenfieldRuntimeDocumentParticipantContext,
	RuntimeSessionTodoController,
} from "@vetta/runtime-core";
import { selectConversationDocumentEntries } from "@vetta/runtime-core";
import type { AgentFeatureDefinition, StoredSessionEvent } from "@vetta/runtime-core/kernel";
import { TODO_SNAPSHOT_TYPE, type TodoSnapshot, type TodoSnapshotEnvelope, TodoStore } from "../../core/todo-store.js";
import { createTodoTool } from "../../core/tools/todo/index.js";
import {
	adaptCodingAgentToolRegistration,
	type CodingAgentRuntimeToolRegistration,
} from "./greenfield-tool-adapter.js";

const TodoItemSchema = Type.Object(
	{
		id: Type.Number(),
		content: Type.String(),
		status: Type.Union([Type.Literal("pending"), Type.Literal("in_progress"), Type.Literal("done")]),
	},
	{ additionalProperties: false },
);

const TodoSnapshotSchema = Type.Union([
	Type.Array(TodoItemSchema),
	Type.Object(
		{
			items: Type.Array(TodoItemSchema),
			lockedBy: Type.Union([Type.Literal("scene"), Type.Null()]),
		},
		{ additionalProperties: false },
	),
]);

export interface CodingAgentTodoRuntimeOptions {
	readonly store?: TodoStore;
	readonly createEntryId?: () => string;
	readonly now?: () => number;
}

/**
 * 一个 Session 内 Todo 的唯一状态所有者。
 *
 * Tool、Continuation、Prompt Scene 与宿主 Controller 都读取同一个 TodoStore；
 * Runtime Core 仅通过通用 Conversation Document participant 保存 custom entry。
 */
export class CodingAgentTodoRuntime implements GreenfieldRuntimeDocumentParticipant, RuntimeSessionTodoController {
	private readonly store: TodoStore;
	private readonly createEntryId: () => string;
	private readonly now: () => number;
	private documentContext: GreenfieldRuntimeDocumentParticipantContext | undefined;
	private unsubscribe: (() => void) | undefined;
	private persistenceTail: Promise<void> = Promise.resolve();
	private latestPersistence: Promise<void> = Promise.resolve();
	private readonly pendingSnapshots: TodoSnapshotEnvelope[] = [];
	private activeTurn = false;
	private restoring = false;
	private disposed = false;

	constructor(options: CodingAgentTodoRuntimeOptions = {}) {
		this.store = options.store ?? new TodoStore();
		this.createEntryId = options.createEntryId ?? randomUUID;
		this.now = options.now ?? Date.now;
	}

	getTodoStore(): TodoStore {
		return this.store;
	}

	getAll(): ReturnType<TodoStore["getAll"]> {
		return this.store.getAll();
	}

	isLocked(): boolean {
		return this.store.isLocked();
	}

	readItems(): ReturnType<RuntimeSessionTodoController["readItems"]> {
		return this.store.getAll().map((item) => ({ ...item }));
	}

	clear(): boolean {
		if (this.store.isLocked() || this.store.getAll().length === 0) return false;
		this.store.clear();
		return true;
	}

	initialize(document: ConversationDocument, context: GreenfieldRuntimeDocumentParticipantContext): void {
		if (this.documentContext) {
			throw new Error("Coding Agent Todo Runtime is already initialized");
		}
		this.documentContext = context;
		const snapshot = latestTodoSnapshot(document);
		if (snapshot) this.restore(snapshot);
		this.unsubscribe = this.store.subscribe(() => {
			if (!this.restoring) this.captureSnapshot();
		});
	}

	onDocumentChanged(document: ConversationDocument): void {
		const snapshot = latestTodoSnapshot(document);
		this.restore(snapshot ?? []);
	}

	async onSessionEvent(event: StoredSessionEvent): Promise<void> {
		if (event.type === "turn.started") {
			this.activeTurn = true;
			return;
		}
		if (event.type === "message.appended" && event.message.role === "toolResult") {
			this.schedulePendingSnapshots();
			await this.latestPersistence;
			return;
		}
		if (event.type === "turn.completed" || event.type === "turn.cancelled" || event.type === "turn.failed") {
			this.activeTurn = false;
			this.schedulePendingSnapshots();
			await this.latestPersistence;
		}
	}

	async flush(): Promise<void> {
		if (!this.activeTurn) this.schedulePendingSnapshots();
		await this.latestPersistence;
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		this.unsubscribe?.();
		this.unsubscribe = undefined;
		this.activeTurn = false;
		await this.flush();
	}

	private captureSnapshot(): void {
		this.pendingSnapshots.push({
			items: this.store.getAll().map((item) => ({ ...item })),
			lockedBy: this.store.getLockSource(),
		});
		if (!this.activeTurn) this.schedulePendingSnapshots();
	}

	private schedulePendingSnapshots(): void {
		const context = this.documentContext;
		if (!context) return;
		for (const snapshot of this.pendingSnapshots.splice(0)) {
			const operation = this.persistenceTail.then(() =>
				context.appendCustomEntry({
					entryId: this.createEntryId(),
					customType: TODO_SNAPSHOT_TYPE,
					data: snapshot,
					timestamp: new Date(this.now()).toISOString(),
				}),
			);
			this.latestPersistence = operation;
			this.persistenceTail = operation.catch(() => undefined);
		}
	}

	private restore(snapshot: TodoSnapshot): void {
		this.restoring = true;
		try {
			this.store.restoreFromSnapshot(snapshot);
		} finally {
			this.restoring = false;
		}
	}
}

export function createCodingAgentTodoRuntimeToolRegistration(
	runtime: CodingAgentTodoRuntime,
): CodingAgentRuntimeToolRegistration {
	const registration = adaptCodingAgentToolRegistration(
		createTodoTool({ getTodoStore: () => runtime.getTodoStore() }),
	);
	return {
		...registration,
		tool: {
			...registration.tool,
			async execute(request) {
				const result = await registration.tool.execute(request);
				await runtime.flush();
				return result;
			},
		},
	};
}

export function createCodingAgentTodoRuntimeFeature(
	registration: CodingAgentRuntimeToolRegistration,
): AgentFeatureDefinition {
	return {
		id: "coding-agent.todo",
		async prepare(context) {
			context.signal.throwIfAborted();
			return {
				async contribute(contributionContext) {
					contributionContext.signal.throwIfAborted();
					return { tools: [registration.tool] };
				},
				async dispose() {},
			};
		},
	};
}

function latestTodoSnapshot(document: ConversationDocument): TodoSnapshot | undefined {
	for (const entry of [...selectConversationDocumentEntries(document)].reverse()) {
		if (entry.type !== "custom" || entry.customType !== TODO_SNAPSHOT_TYPE) continue;
		if (!Value.Check(TodoSnapshotSchema, entry.data)) {
			throw new Error(`Invalid ${TODO_SNAPSHOT_TYPE} entry: ${entry.id}`);
		}
		return entry.data as TodoSnapshot;
	}
	return undefined;
}
