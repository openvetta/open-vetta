import type { ActionDefinition } from "../types.js";
import { createAgentActions } from "./agent.action.js";

export function registerAgentActions(register: (action: ActionDefinition) => void): void {
	for (const action of createAgentActions()) {
		register(action);
	}
}
