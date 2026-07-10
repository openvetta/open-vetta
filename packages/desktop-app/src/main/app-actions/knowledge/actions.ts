import type { ActionDefinition } from "../types.js";
import { createKnowledgeActions } from "./knowledge.action.js";

export function registerKnowledgeActions(register: (action: ActionDefinition) => void): void {
	for (const action of createKnowledgeActions()) {
		register(action);
	}
}
