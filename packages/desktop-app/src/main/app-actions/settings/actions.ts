import type { ActionDefinition } from "../types.js";
import { createSettingsActions } from "./settings.action.js";

export function registerSettingsActions(register: (action: ActionDefinition) => void): void {
	for (const action of createSettingsActions()) {
		register(action);
	}
}
