import type { ActionDefinition } from "../types.js";
import { createUpdaterActions } from "./updater.action.js";

export function registerUpdaterActions(register: (action: ActionDefinition) => void): void {
	for (const action of createUpdaterActions()) {
		register(action);
	}
}
