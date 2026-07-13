import type { BatchTaskService } from "../batch-tasks/batch-task-service.js";
import type { SchedulerService } from "../scheduler/scheduler-service.js";
import { registerAgentActions } from "./agent/actions.js";
import { registerAppearanceActions } from "./appearance/actions.js";
import { registerBatchTasksActions } from "./batch-tasks/actions.js";
import { AppActionCatalog } from "./catalog.js";
import { registerDownloadsActions } from "./downloads/actions.js";
import { registerGeneralActions } from "./general/actions.js";
import { registerImActions } from "./im/actions.js";
import { registerKnowledgeActions } from "./knowledge/actions.js";
import { registerMcpActions } from "./mcp/actions.js";
import { registerModelsActions } from "./models/actions.js";
import { registerNavigationActions } from "./navigation/actions.js";
import { registerPluginsActions } from "./plugins/actions.js";
import { registerProjectsActions } from "./projects/actions.js";
import { AppActionRuntime } from "./runtime.js";
import { registerSchedulerActions } from "./scheduler/actions.js";
import { registerShortcutsActions } from "./shortcuts/actions.js";
import { registerSkillsActions } from "./skills/actions.js";
import type { ActionApprovalRequester } from "./types.js";
import { registerUpdaterActions } from "./updater/actions.js";
import { registerWebhookActions } from "./webhook/actions.js";

export function createAppActionRuntime(
	approvalRequester: ActionApprovalRequester,
	batchTaskService: BatchTaskService,
	schedulerService: SchedulerService,
): AppActionRuntime {
	const catalog = new AppActionCatalog();
	const register = catalog.register.bind(catalog);

	registerAgentActions(register);
	registerAppearanceActions(register);
	registerBatchTasksActions(register, batchTaskService);
	registerDownloadsActions(register);
	registerGeneralActions(register);
	registerImActions(register);
	registerKnowledgeActions(register);
	registerMcpActions(register);
	registerModelsActions(register);
	registerNavigationActions(register);
	registerPluginsActions(register);
	registerProjectsActions(register);
	registerSchedulerActions(register, schedulerService);
	registerShortcutsActions(register);
	registerSkillsActions(register);
	registerUpdaterActions(register);
	registerWebhookActions(register);

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
