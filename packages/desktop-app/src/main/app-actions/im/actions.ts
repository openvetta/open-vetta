import type { ActionDefinition } from "../types.js";
import { createImActions } from "./im.action.js";

export function registerImActions(register: (action: ActionDefinition) => void): void {
	for (const action of createImActions()) {
		register(action);
	}
}
