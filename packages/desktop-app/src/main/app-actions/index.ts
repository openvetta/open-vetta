import type { BatchTaskService } from "../batch-tasks/batch-task-service.js";
import { registerAppearanceActions } from "./appearance/actions.js";
import { registerBatchTasksActions } from "./batch-tasks/actions.js";
import { AppActionCatalog } from "./catalog.js";
import { registerNavigationActions } from "./navigation/actions.js";
import { AppActionRuntime } from "./runtime.js";
import type { ActionApprovalRequester } from "./types.js";

export function createAppActionRuntime(
	approvalRequester: ActionApprovalRequester,
	batchTaskService: BatchTaskService,
): AppActionRuntime {
	const catalog = new AppActionCatalog();
	const register = catalog.register.bind(catalog);

	registerAppearanceActions(register);
	registerBatchTasksActions(register, batchTaskService);
	registerNavigationActions(register);

	return new AppActionRuntime(catalog, approvalRequester);
}

export { AppActionRuntime } from "./runtime.js";
export type {
	ActionApprovalMetadata,
	ActionApprovalPresentation,
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
