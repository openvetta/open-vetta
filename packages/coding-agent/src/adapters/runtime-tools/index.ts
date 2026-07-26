/**
 * Stable host-adapter surface for Runtime Tools composition roots.
 * Internal file layout under adapters/runtime-tools may change; import from
 * `@vetta/coding-agent/host` instead of deep file paths.
 */

export {
	createCodingAgentBackgroundCommandService,
	type RuntimeBackgroundCommandEvent,
	type RuntimeBackgroundCommandService,
	type RuntimeBackgroundCommandSnapshot,
	type RuntimeBackgroundCommandStatus,
	type RuntimeBackgroundCommandStopReason,
} from "./background-command-service.js";
export {
	createLegacyCommandToolExecutor,
	type LegacyCommandToolExecutorOptions,
	type RuntimeCommandToolExecutor,
	type RuntimeCommandToolExecutorRequest,
	type RuntimeCommandToolName,
	type RuntimeCommandToolResult,
} from "./command-executor.js";
export {
	createToolExecutableResolver,
	type EnsureTool,
	type EnsureToolDependencies,
	ensureToolWithDependencies,
	type ToolExecutableName,
	type ToolExecutableResolver,
} from "./executable-resolver.js";
export {
	type CodingAgentForegroundCommandHost,
	createCodingAgentForegroundCommandHost,
	type RuntimeForegroundCommandOperations,
} from "./foreground-command-operations.js";
