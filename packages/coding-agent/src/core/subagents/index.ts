export { SubagentCoordinator } from "./coordinator.js";
export { buildSubagentNotification, SubagentDeliveryTracker } from "./notifications.js";
export { ensureSubagentDir, resolveSubagentDir } from "./persistence.js";
export {
	buildToolsForSubagentType,
	type CreateAgentSessionFn,
	createDefaultSubagentSessionFactory,
	type DefaultSubagentSessionFactoryOptions,
} from "./session-factory.js";
export {
	createFollowupTaskTool,
	createInterruptAgentTool,
	createListAgentsTool,
	createSendMessageTool,
	createSpawnAgentTool,
	createSubagentControlTools,
	createWaitAgentTool,
	SUBAGENT_CONTROL_TOOL_NAMES,
} from "./tools/index.js";
export { createEmptySubagentTypeRegistry, SubagentTypeRegistry } from "./type-registry.js";
export { createExplorerTypeDefinition, EXPLORER_SYSTEM_PROMPT } from "./types/explorer.js";
export {
	clipFinalText,
	emptyUsage,
	isValidTaskName,
	SUBAGENT_FINAL_TEXT_LIMIT,
	SUBAGENT_TYPE_EXPLORER,
	type SubagentChildHandle,
	type SubagentCoordinatorOptions,
	type SubagentNotificationPayload,
	type SubagentParentContext,
	type SubagentSessionFactory,
	type SubagentSnapshot,
	type SubagentSpawnRequest,
	type SubagentStatus,
	type SubagentTypeDefinition,
	type SubagentTypeId,
	type SubagentTypeRegistryLike,
	type SubagentUsageSnapshot,
	TASK_NAME_PATTERN,
	taskPath,
} from "./types.js";

import { createEmptySubagentTypeRegistry, type SubagentTypeRegistry } from "./type-registry.js";
import { createExplorerTypeDefinition } from "./types/explorer.js";

/**
 * Default product registry: explorer only.
 * Hosts/tests can clone and register more types (worker, reviewer, …).
 */
export function createDefaultSubagentTypeRegistry(): SubagentTypeRegistry {
	return createEmptySubagentTypeRegistry().register(createExplorerTypeDefinition());
}
