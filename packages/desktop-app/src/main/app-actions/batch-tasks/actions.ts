import type { BatchTaskService } from "../../batch-tasks/batch-task-service.js";
import type { ActionDefinition } from "../types.js";
import { createBatchTasksActions } from "./batch-tasks.action.js";

export function registerBatchTasksActions(
	register: (action: ActionDefinition) => void,
	service: BatchTaskService,
): void {
	for (const action of createBatchTasksActions(service)) {
		register(action);
	}
}
