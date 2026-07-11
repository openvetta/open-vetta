import type { ActionDefinition } from "../types.js";
import { createGeneralActions } from "./general.action.js";

export function registerGeneralActions(register: (action: ActionDefinition) => void): void {
	for (const action of createGeneralActions()) {
		register(action);
	}
}
