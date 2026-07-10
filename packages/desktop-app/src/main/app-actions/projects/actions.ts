import type { ActionDefinition } from "../types.js";
import { createProjectsActions } from "./projects.action.js";

export function registerProjectsActions(register: (action: ActionDefinition) => void): void {
	for (const action of createProjectsActions()) {
		register(action);
	}
}
