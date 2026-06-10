import { getAppLogger } from "../logger.js";
import type { ActionDefinition, ActionMetadata, ActionSearchResult } from "./types.js";
import { ActionError } from "./types.js";

const log = getAppLogger("action-catalog");

export class AppActionCatalog {
	private actions = new Map<string, ActionDefinition>();

	register(action: ActionDefinition): void {
		if (this.actions.has(action.id)) {
			log.error("register: duplicate action", { actionId: action.id, domain: action.domain });
			throw new ActionError("ACTION_DUPLICATE", `Action is already registered: ${action.id}`);
		}
		if (action.requiresApproval && !action.approval) {
			log.error("register: missing approval metadata", { actionId: action.id, domain: action.domain });
			throw new ActionError(
				"ACTION_APPROVAL_CONFIG_INVALID",
				`Action requires approval but has no approval UI configured: ${action.id}`,
			);
		}
		if (action.approval) {
			const presentationIds = action.approval.presentations.map((presentation) => presentation.id);
			if (new Set(presentationIds).size !== presentationIds.length) {
				log.error("register: duplicate approval presentation ids", {
					actionId: action.id,
					domain: action.domain,
					presentationIds,
				});
				throw new ActionError(
					"ACTION_APPROVAL_CONFIG_INVALID",
					`Action has duplicate approval UI ids: ${action.id}`,
				);
			}
			if (!presentationIds.includes(action.approval.defaultPresentation)) {
				log.error("register: default approval presentation is not declared", {
					actionId: action.id,
					domain: action.domain,
					defaultPresentation: action.approval.defaultPresentation,
					presentationIds,
				});
				throw new ActionError(
					"ACTION_APPROVAL_CONFIG_INVALID",
					`Action default approval UI is not declared: ${action.id}`,
				);
			}
		}
		this.actions.set(action.id, action);
		log.info("register: success", {
			actionId: action.id,
			domain: action.domain,
			availability: action.availability,
			permission: action.permission,
			requiresApproval: action.requiresApproval !== undefined,
			registeredCount: this.actions.size,
		});
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
		const results = candidates.map((action) => ({
			id: action.id,
			domain: action.domain,
			title: action.title,
			summary: action.summary,
			availability: action.availability,
		}));
		log.info("search: result", {
			query,
			domain,
			resultCount: results.length,
			actionIds: results.map((action) => action.id),
		});
		return results;
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
			approval: action.approval,
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
