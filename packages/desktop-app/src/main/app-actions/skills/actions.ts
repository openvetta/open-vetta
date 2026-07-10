import type { ActionDefinition } from "../types.js";
import { createSkillsActions } from "./skills.action.js";

export function registerSkillsActions(register: (action: ActionDefinition) => void): void {
	for (const action of createSkillsActions()) {
		register(action);
	}
}
