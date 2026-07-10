import type { ActionDefinition } from "../types.js";
import { createModelsActions } from "./models.action.js";

export function registerModelsActions(register: (action: ActionDefinition) => void): void {
	for (const action of createModelsActions()) {
		register(action);
	}
}
