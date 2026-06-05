import type { ActionDefinition } from "../types.js";
import { openAction } from "./open.action.js";

export function registerNavigationActions(register: (action: ActionDefinition) => void): void {
	register(openAction);
}
