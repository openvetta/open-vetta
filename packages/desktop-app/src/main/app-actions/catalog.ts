import { getAppLogger } from "../logger.js";
import { searchActions } from "./search.js";
import type { ActionDefinition, ActionMetadata, ActionSearchResult } from "./types.js";
import { ActionError } from "./types.js";

const log = getAppLogger("action-catalog");

const BUILTIN_PROVIDER_ID = "builtin";
const BUILTIN_PROVIDER_PRIORITY = 0;

export interface AppActionProviderOptions {
	providerId: string;
	priority: number;
}

interface AppActionProviderEntry extends AppActionProviderOptions {
	action: ActionDefinition;
	sequence: number;
}

export class AppActionCatalog {
	private readonly providers = new Map<string, Map<string, AppActionProviderEntry>>();
	private registrationSequence = 0;

	register(
		action: ActionDefinition,
		options: AppActionProviderOptions = {
			providerId: BUILTIN_PROVIDER_ID,
			priority: BUILTIN_PROVIDER_PRIORITY,
		},
	): () => void {
		return this.registerProvider([action], options).get(action.id)!;
	}

	registerProvider(
		actions: readonly ActionDefinition[],
		options: AppActionProviderOptions,
	): ReadonlyMap<string, () => void> {
		const actionIds = actions.map((action) => action.id);
		if (new Set(actionIds).size !== actionIds.length) {
			throw new ActionError(
				"ACTION_DUPLICATE",
				`Action provider contains duplicate action ids: ${options.providerId}`,
			);
		}
		for (const action of actions) {
			if (this.providers.get(action.id)?.has(options.providerId)) {
				log.error("register: duplicate provider action", {
					actionId: action.id,
					domain: action.domain,
					providerId: options.providerId,
				});
				throw new ActionError(
					"ACTION_DUPLICATE",
					`Action is already registered by provider ${options.providerId}: ${action.id}`,
				);
			}
			this.validateAction(action);
		}

		const sequence = ++this.registrationSequence;
		const unregisterByActionId = new Map<string, () => void>();
		for (const action of actions) {
			const providers = this.providers.get(action.id) ?? new Map<string, AppActionProviderEntry>();
			const entry: AppActionProviderEntry = { action, ...options, sequence };
			providers.set(options.providerId, entry);
			this.providers.set(action.id, providers);
			unregisterByActionId.set(action.id, this.createUnregister(entry));
			log.info("register: success", {
				actionId: action.id,
				domain: action.domain,
				providerId: options.providerId,
				priority: options.priority,
				availability: action.availability,
				permission: action.permission,
				requiresApproval: action.requiresApproval !== undefined,
				registeredCount: this.providers.size,
			});
		}
		return unregisterByActionId;
	}

	private validateAction(action: ActionDefinition): void {
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
	}

	private createUnregister(entry: AppActionProviderEntry): () => void {
		let registered = true;
		return () => {
			if (!registered) return;
			registered = false;
			const providers = this.providers.get(entry.action.id);
			if (providers?.get(entry.providerId) !== entry) return;
			providers.delete(entry.providerId);
			if (providers.size === 0) this.providers.delete(entry.action.id);
			log.info("unregister: success", {
				actionId: entry.action.id,
				domain: entry.action.domain,
				providerId: entry.providerId,
				registeredCount: this.providers.size,
			});
		};
	}

	private getActiveAction(actionId: string): ActionDefinition | undefined {
		const providers = this.providers.get(actionId);
		if (!providers) return undefined;
		let active: AppActionProviderEntry | undefined;
		for (const candidate of providers.values()) {
			if (
				!active ||
				candidate.priority > active.priority ||
				(candidate.priority === active.priority && candidate.sequence > active.sequence)
			) {
				active = candidate;
			}
		}
		return active?.action;
	}

	private *getActiveActions(): IterableIterator<ActionDefinition> {
		for (const actionId of this.providers.keys()) {
			const action = this.getActiveAction(actionId);
			if (action) yield action;
		}
	}

	search(options: { query?: string; domain?: string } = {}): ActionSearchResult[] {
		const results = searchActions(this.getActiveActions(), options);
		log.info("search: result", {
			query: options.query?.trim() ?? "",
			domain: options.domain?.trim(),
			resultCount: results.length,
			actionIds: results.map((action) => action.id),
		});
		return results;
	}

	describe(actionId: string): ActionMetadata {
		const action = this.getActiveAction(actionId);
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
			keywords: action.keywords,
			approval: action.approval,
			inputSchema: action.inputSchema,
			examples: action.examples,
		};
	}

	get(actionId: string): ActionDefinition {
		const action = this.getActiveAction(actionId);
		if (!action) {
			throw new ActionError("ACTION_NOT_FOUND", `Action not found: ${actionId}`);
		}
		return action;
	}
}
