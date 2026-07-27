export {
	CODING_TOOL_AVAILABILITY_ERROR_CODES,
	CodingToolAvailabilityError,
	type CodingToolAvailabilityErrorCode,
	guardCodingToolRegistration,
} from "./coding-tool-availability.js";
export {
	type CodingToolAvailabilityState,
	type CodingToolCatalog,
	type CodingToolCatalogEntry,
	type CodingToolCatalogSnapshot,
	type CodingToolRegistry,
	type CodingToolRevokeOptions,
	InMemoryCodingToolRegistry,
	type InMemoryCodingToolRegistryOptions,
} from "./coding-tool-catalog.js";
export {
	CODING_TOOLS_FEATURE_ID,
	type CodingToolsFeatureOptions,
	createCodingToolsFeature,
} from "./coding-tools-feature.js";
export {
	type CodingToolExecutable,
	type CodingToolExecutableResolver,
	createLocalCodingToolExecutableResolver,
	type LocalCodingToolExecutableResolverOptions,
} from "./host/index.js";
export {
	type BackgroundCommandExecutorOptions,
	type BackgroundCommandToolDetails,
	createBackgroundCommandToolExecutor,
} from "./shared/background-command-executor.js";
export type {
	BackgroundCommandHost,
	BackgroundCommandOutput,
	BackgroundCommandOutputStore,
	BackgroundCommandProcess,
	BackgroundCommandProcessOperations,
	SpawnBackgroundCommandProcessOptions,
} from "./shared/background-command-host.js";
export { createBackgroundCommandService } from "./shared/background-command-lifecycle.js";
export type {
	BackgroundCommandEvent,
	BackgroundCommandService,
	BackgroundCommandSnapshot,
	BackgroundCommandStatus,
	BackgroundCommandStopReason,
	ReadBackgroundCommandOutputOptions,
	SpawnBackgroundCommandOptions,
} from "./shared/background-command-service.js";
export { buildBackgroundCommandNotification } from "./shared/background-command-service.js";
export {
	type CommandToolExecutor,
	type CommandToolExecutorRequest,
	type CommandToolInput,
	CommandToolInputSchema,
	type CommandToolName,
} from "./shared/command-tool.js";
export {
	type CommandSpawnContext,
	type CommandSpawnHook,
	createForegroundCommandToolExecutor,
	DEFAULT_COMMAND_BLOCK_UNTIL_SEC,
	type ForegroundCommandExecutorOptions,
	type ForegroundCommandOperations,
	type ForegroundCommandToolDetails,
} from "./shared/foreground-command-executor.js";
export {
	CODING_TOOL_SCOPES,
	type CodingToolActivation,
	type CodingToolCategory,
	type CodingToolRegistration,
	type CodingToolScope,
	DEFAULT_CODING_TOOL_SCOPE,
	selectCodingToolRegistrations,
	selectCodingTools,
	selectCodingToolsForScope,
} from "./tool-registration.js";
export {
	BASH_TOOL_CATEGORY,
	BASH_TOOL_DESCRIPTION,
	type BashToolInput,
	BashToolInputSchema,
	type BashToolOptions,
	type BashToolRegistrationOptions,
	createBashTool,
	createBashToolRegistration,
	getBashToolScopes,
} from "./tools/bash/index.js";
export {
	CURRENT_TIME_TOOL_CATEGORY,
	CURRENT_TIME_TOOL_SCOPES,
	type CurrentTimeToolDetails,
	type CurrentTimeToolInput,
	CurrentTimeToolInputSchema,
	type CurrentTimeToolOptions,
	createCurrentTimeTool,
	createCurrentTimeToolRegistration,
} from "./tools/current-time/index.js";
export {
	type AnchorEditInput,
	AnchorEditInputSchema,
	createEditTool,
	createEditToolRegistration,
	EDIT_TOOL_CATEGORY,
	EDIT_TOOL_DESCRIPTION,
	EDIT_TOOL_SCOPES,
	type EditOperations,
	type EditPathPolicy,
	type EditToolDetails,
	type EditToolInput,
	EditToolInputSchema,
	type EditToolOptions,
} from "./tools/edit/index.js";
export {
	createFindTool,
	createFindToolRegistration,
	FIND_TOOL_CATEGORY,
	FIND_TOOL_DESCRIPTION,
	FIND_TOOL_SCOPES,
	type FindOperations,
	type FindToolDetails,
	type FindToolInput,
	FindToolInputSchema,
	type FindToolOptions,
} from "./tools/find/index.js";
export {
	createGlobTool,
	createGlobToolRegistration,
	GLOB_TOOL_CATEGORY,
	GLOB_TOOL_DESCRIPTION,
	GLOB_TOOL_SCOPES,
	type GlobOperations,
	type GlobToolDetails,
	type GlobToolInput,
	GlobToolInputSchema,
	type GlobToolOptions,
} from "./tools/glob/index.js";
export {
	createGrepTool,
	createGrepToolRegistration,
	GREP_TOOL_CATEGORY,
	GREP_TOOL_DESCRIPTION,
	GREP_TOOL_SCOPES,
	type GrepOperations,
	type GrepToolDetails,
	type GrepToolInput,
	GrepToolInputSchema,
	type GrepToolOptions,
} from "./tools/grep/index.js";
export {
	createLsTool,
	createLsToolRegistration,
	LS_TOOL_CATEGORY,
	LS_TOOL_DESCRIPTION,
	LS_TOOL_SCOPES,
	type LsOperations,
	type LsStat,
	type LsToolDetails,
	type LsToolInput,
	LsToolInputSchema,
	type LsToolOptions,
} from "./tools/ls/index.js";
export {
	createReadTool,
	createReadToolRegistration,
	type ImageResizeFailure,
	type ImageResizeOptions,
	type ImageResizeResult,
	READ_TOOL_CATEGORY,
	READ_TOOL_DESCRIPTION,
	READ_TOOL_SCOPES,
	type ReadImageProcessor,
	type ReadOperations,
	type ReadToolDetails,
	type ReadToolInput,
	ReadToolInputSchema,
	type ReadToolOptions,
	type ResizedImage,
} from "./tools/read/index.js";
export {
	createShellTool,
	createShellToolRegistration,
	getShellToolScopes,
	SHELL_TOOL_CATEGORY,
	SHELL_TOOL_DESCRIPTION,
	type ShellToolInput,
	ShellToolInputSchema,
	type ShellToolOptions,
	type ShellToolRegistrationOptions,
} from "./tools/shell/index.js";
export {
	createTaskOutputTool,
	createTaskOutputToolRegistration,
	TASK_OUTPUT_TOOL_CATEGORY,
	TASK_OUTPUT_TOOL_DESCRIPTION,
	TASK_OUTPUT_TOOL_REQUIRES,
	TASK_OUTPUT_TOOL_SCOPES,
	type TaskOutputToolDetails,
	type TaskOutputToolInput,
	TaskOutputToolInputSchema,
	type TaskOutputToolOptions,
} from "./tools/task-output/index.js";
export {
	createTaskStopTool,
	createTaskStopToolRegistration,
	TASK_STOP_TOOL_CATEGORY,
	TASK_STOP_TOOL_DESCRIPTION,
	TASK_STOP_TOOL_REQUIRES,
	TASK_STOP_TOOL_SCOPES,
	type TaskStopToolDetails,
	type TaskStopToolInput,
	TaskStopToolInputSchema,
	type TaskStopToolOptions,
} from "./tools/task-stop/index.js";
export {
	createTreeTool,
	createTreeToolRegistration,
	TREE_TOOL_CATEGORY,
	TREE_TOOL_DESCRIPTION,
	TREE_TOOL_SCOPES,
	type TreeOperations,
	type TreeToolDetails,
	type TreeToolInput,
	TreeToolInputSchema,
	type TreeToolOptions,
} from "./tools/tree/index.js";
export {
	createWriteTool,
	createWriteToolRegistration,
	WRITE_TOOL_CATEGORY,
	WRITE_TOOL_DESCRIPTION,
	WRITE_TOOL_SCOPES,
	type WriteOperations,
	type WritePathPolicy,
	type WriteToolInput,
	WriteToolInputSchema,
	type WriteToolOptions,
} from "./tools/write/index.js";
