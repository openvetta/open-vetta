import type { SchedulerService } from "../../scheduler/scheduler-service.js";
import type { ActionDefinition } from "../types.js";
import { createSchedulerActions } from "./scheduler.action.js";

export function registerSchedulerActions(
	register: (action: ActionDefinition) => void,
	service: SchedulerService,
): void {
	for (const action of createSchedulerActions(service)) {
		register(action);
	}
}
