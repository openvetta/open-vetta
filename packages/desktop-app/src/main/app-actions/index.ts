import { AppActionCatalog } from "./catalog.js";
import { registerAppearanceActions } from "./domains/appearance.actions.js";
import { registerNavigationActions } from "./domains/navigation.actions.js";
import { registerSystemActions } from "./domains/system.actions.js";
import { AppActionRuntime } from "./runtime.js";
import type { ActionApprovalRequester } from "./types.js";

export function createAppActionRuntime(approvalRequester: ActionApprovalRequester): AppActionRuntime {
	const catalog = new AppActionCatalog();
	const register = catalog.register.bind(catalog);

	registerSystemActions(register);
	registerAppearanceActions(register);
	registerNavigationActions(register);

	return new AppActionRuntime(catalog, approvalRequester);
}

export { AppActionRuntime } from "./runtime.js";
export type {
	ActionApprovalRequest,
	ActionApprovalRequester,
	ActionContext,
	ActionDefinition,
	ActionErrorBody,
	ActionMetadata,
	ActionSearchResult,
	JsonValue,
} from "./types.js";
export { ActionError } from "./types.js";
