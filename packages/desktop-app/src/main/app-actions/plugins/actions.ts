import type { ActionDefinition } from "../types.js";
import { createPluginsActions } from "./plugins.action.js";

export function registerPluginsActions(register: (action: ActionDefinition) => void): void {
	for (const action of createPluginsActions()) {
		register(action);
	}
}
