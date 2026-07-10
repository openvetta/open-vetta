import type { ActionDefinition } from "../types.js";
import { createDownloadsActions } from "./downloads.action.js";

export function registerDownloadsActions(register: (action: ActionDefinition) => void): void {
	for (const action of createDownloadsActions()) {
		register(action);
	}
}
