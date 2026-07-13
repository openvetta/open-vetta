import type { ActionDefinition } from "../types.js";
import { createShortcutsActions } from "./shortcuts.action.js";

export function registerShortcutsActions(register: (action: ActionDefinition) => void): void {
	for (const action of createShortcutsActions()) {
		register(action);
	}
}
