import type { GreenfieldRuntimeDocumentParticipant, RuntimeSessionTodoController } from "@vetta/runtime-core";
import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import type { ConversationScenario, ToolCategory } from "../profiles/index.js";
import type { TodoLockSource, TodoState } from "../work-state/index.js";

export interface CodingAgentRuntimeToolRegistration {
	readonly tool: RuntimeToolDefinition;
	readonly scopeUse: readonly ConversationScenario[];
	readonly requires?: readonly string[];
	readonly agentModes?: readonly string[];
	readonly modelOrder?: number;
	readonly category: ToolCategory;
}

export interface CodingAgentTodoRuntime extends GreenfieldRuntimeDocumentParticipant, RuntimeSessionTodoController {
	getAll(): ReturnType<TodoState["getAll"]>;
	isLocked(): boolean;
	getLockSource(): TodoLockSource | null;
	createMany(contents: string[]): ReturnType<TodoState["createMany"]>;
	update(id: number, status: "pending" | "in_progress" | "done"): ReturnType<TodoState["update"]>;
	initializeTodoItems(contents: readonly string[], lockSource?: TodoLockSource): void;
	readSceneTodoState(): { readonly locked: boolean; readonly itemCount: number };
	initializeSceneTodoItems(contents: readonly string[]): void;
	flush(): Promise<void>;
	dispose(): Promise<void>;
}
