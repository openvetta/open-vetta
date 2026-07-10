import type { ActionDefinition } from "../types.js";
import { createMcpActions } from "./mcp.action.js";

export function registerMcpActions(register: (action: ActionDefinition) => void): void {
	for (const action of createMcpActions()) {
		register(action);
	}
}
