import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import type { TodoStore } from "../../todo-store.js";
import { loadToolDescription } from "../description.js";

const todoSchema = Type.Object({
	action: Type.Union([Type.Literal("create"), Type.Literal("update"), Type.Literal("list")], {
		description: 'Action to perform: "create" (add items), "update" (change status), or "list" (show all)',
	}),
	items: Type.Optional(
		Type.Array(Type.String(), {
			description: 'For action="create": array of step descriptions to add',
		}),
	),
	id: Type.Optional(
		Type.Number({
			description: 'For action="update": the todo item ID to update',
		}),
	),
	status: Type.Optional(
		Type.Union([Type.Literal("pending"), Type.Literal("in_progress"), Type.Literal("done")], {
			description: 'For action="update": new status',
		}),
	),
});

export interface TodoToolDetails {
	action: string;
}

export interface TodoToolOptions {
	getTodoStore: () => TodoStore;
}

function formatItems(store: TodoStore): string {
	const items = store.getAll();
	if (items.length === 0) return "No todo items.";

	const statusIcon: Record<string, string> = {
		pending: "[ ]",
		in_progress: "[~]",
		done: "[x]",
	};

	const lines = items.map((item) => `${statusIcon[item.status]} #${item.id} ${item.content}`);

	const done = items.filter((i) => i.status === "done").length;
	const total = items.length;
	lines.push("", `Progress: ${done}/${total} completed`);

	return lines.join("\n");
}

export function createTodoTool(options: TodoToolOptions): AgentTool<typeof todoSchema> {
	const fallbackDescription = "Manage a todo list to plan and track progress on multi-step tasks.";
	const description = loadToolDescription(import.meta.url, fallbackDescription);

	return {
		name: "todo",
		label: "todo",
		description,
		parameters: todoSchema,
		execute: async (
			_toolCallId: string,
			{
				action,
				items,
				id,
				status,
			}: { action: "create" | "update" | "list"; items?: string[]; id?: number; status?: string },
		) => {
			const store = options.getTodoStore();

			switch (action) {
				case "create": {
					if (!items || items.length === 0) {
						return {
							content: [
								{ type: "text" as const, text: 'Error: action="create" requires a non-empty "items" array.' },
							],
							details: { action },
						};
					}
					const created = store.createMany(items);
					const itemList = created.map((i) => `  #${i.id} ${i.content}`).join("\n");
					return {
						content: [
							{
								type: "text" as const,
								text: `Created ${created.length} todo items:\n${itemList}\n\n${formatItems(store)}`,
							},
						],
						details: { action },
					};
				}

				case "update": {
					if (id === undefined || !status) {
						return {
							content: [
								{ type: "text" as const, text: 'Error: action="update" requires "id" (number) and "status".' },
							],
							details: { action },
						};
					}

					// Before progressing any item, check for skipped earlier items
					if (status === "in_progress" || status === "done") {
						const allItems = store.getAll();
						const skipped = allItems.filter((i) => i.id < id && i.status !== "done");
						if (skipped.length > 0) {
							const firstSkipped = skipped[0];
							const skippedList = skipped.map((i) => `  #${i.id} [${i.status}] ${i.content}`).join("\n");
							// REJECT the update — do NOT apply it. Force sequential order.
							return {
								content: [
									{
										type: "text" as const,
										text: `REJECTED: Cannot update #${id} to "${status}" because earlier items are not done:\n${skippedList}\n\nYou MUST complete items in order. Work on #${firstSkipped.id} first: "${firstSkipped.content}"\nCall todo(action="update", id=${firstSkipped.id}, status="in_progress") to start it.\n\n${formatItems(store)}`,
									},
								],
								details: { action },
							};
						}
					}

					const updated = store.update(id, status as "pending" | "in_progress" | "done");
					if (!updated) {
						return {
							content: [{ type: "text" as const, text: `Error: todo item #${id} not found.` }],
							details: { action },
						};
					}
					return {
						content: [
							{
								type: "text" as const,
								text: `Updated #${updated.id} → ${updated.status}\n\n${formatItems(store)}`,
							},
						],
						details: { action },
					};
				}

				case "list": {
					return {
						content: [{ type: "text" as const, text: formatItems(store) }],
						details: { action },
					};
				}

				default: {
					return {
						content: [
							{
								type: "text" as const,
								text: `Error: unknown action "${action}". Use "create", "update", or "list".`,
							},
						],
						details: { action: String(action) },
					};
				}
			}
		},
	};
}
