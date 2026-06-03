import type { ActionDefinition, ActionMetadata, ActionSearchResult } from "./types.js";
import { ActionError } from "./types.js";

export class AppActionCatalog {
	private actions = new Map<string, ActionDefinition>();

	register(action: ActionDefinition): void {
		if (this.actions.has(action.id)) {
			throw new ActionError("ACTION_DUPLICATE", `Action is already registered: ${action.id}`);
		}
		this.actions.set(action.id, action);
	}

	search(options: { query?: string; domain?: string } = {}): ActionSearchResult[] {
		const query = options.query?.trim().toLowerCase();
		const domain = options.domain?.trim();
		const candidates = Array.from(this.actions.values()).filter((action) => {
			if (domain && action.domain !== domain) return false;
			if (!query) return true;
			const haystack = `${action.id} ${action.domain} ${action.title} ${action.summary}`.toLowerCase();
			return haystack.includes(query);
		});
		return candidates.map((action) => ({
			id: action.id,
			domain: action.domain,
			title: action.title,
			summary: action.summary,
			availability: action.availability,
		}));
	}

	describe(actionId: string): ActionMetadata {
		const action = this.actions.get(actionId);
		if (!action) {
			throw new ActionError("ACTION_NOT_FOUND", `Action not found: ${actionId}`);
		}
		return {
			id: action.id,
			domain: action.domain,
			title: action.title,
			summary: action.summary,
			availability: action.availability,
			permission: action.permission,
			inputSchema: action.inputSchema,
			examples: action.examples,
		};
	}

	get(actionId: string): ActionDefinition {
		const action = this.actions.get(actionId);
		if (!action) {
			throw new ActionError("ACTION_NOT_FOUND", `Action not found: ${actionId}`);
		}
		return action;
	}
}
