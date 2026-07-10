import type { ActionDefinition } from "../types.js";
import { createWebhookActions } from "./webhook.action.js";

export function registerWebhookActions(register: (action: ActionDefinition) => void): void {
	for (const action of createWebhookActions()) {
		register(action);
	}
}
