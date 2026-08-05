// Core session management

export type { PromptAttachmentRef } from "@vetta/runtime-core";
// Auth and model registry
export {
	type ApiKeyCredential,
	type AuthCredential,
	AuthStorage,
	type AuthStorageBackend,
	type AuthStorageData,
	type AuthStorageTransaction,
	type CodingAgentAuthRuntime,
	createCodingAgentAuthRuntime,
	FileAuthStorageBackend,
	InMemoryAuthStorageBackend,
	type OAuthCredential,
} from "./auth/index.js";
// Compaction
export {
	type BranchPreparation,
	type BranchSummaryResult,
	type CollectEntriesResult,
	type CompactionResult,
	type CutPointResult,
	calculateContextTokens,
	collectEntriesForBranchSummary,
	compact,
	DEFAULT_COMPACTION_SETTINGS,
	estimateTokens,
	type FileOperations,
	findCutPoint,
	findTurnStartIndex,
	type GenerateBranchSummaryOptions,
	generateBranchSummary,
	generateSummary,
	getLastAssistantUsage,
	prepareBranchEntries,
	serializeConversation,
	shouldCompact,
} from "./compaction/index.js";
// Config paths
export { DEFAULT_SERVER_URL, getAgentDir, VERSION } from "./config.js";
// Concurrency limiter (shared by OCR throttle and KB processing session pool)
export { createLimiter, type Limiter } from "./core/concurrency-limit.js";
export { createEventBus, type EventBus, type EventBusController } from "./core/event-bus.js";
// Footer data provider (git branch + extension statuses - data not otherwise available to extensions)
export type { ReadonlyFooterDataProvider } from "./core/footer-data-provider.js";
// Extension system
export type {
	AgentEndEvent,
	AgentStartEvent,
	AgentToolResult,
	AgentToolUpdateCallback,
	AppAction,
	BashToolCallEvent,
	BeforeAgentStartEvent,
	CompactOptions,
	ContextEvent,
	ContextUsage,
	CustomToolCallEvent,
	DirTreeToolCallEvent,
	EditToolCallEvent,
	ExecOptions,
	ExecResult,
	Extension,
	ExtensionActions,
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionCommandContextActions,
	ExtensionContext,
	ExtensionContextActions,
	ExtensionError,
	ExtensionEvent,
	ExtensionExecutionHost,
	ExtensionFactory,
	ExtensionFlag,
	ExtensionHandler,
	ExtensionRuntime,
	ExtensionShortcut,
	ExtensionUIContext,
	ExtensionUIDialogOptions,
	ExtensionWidgetOptions,
	FindToolCallEvent,
	FindToolResultEvent,
	GlobToolCallEvent,
	GlobToolResultEvent,
	GrepToolCallEvent,
	GrepToolResultEvent,
	InputEvent,
	InputEventResult,
	InputSource,
	KeybindingsManager,
	LoadExtensionsResult,
	LsToolCallEvent,
	MessageRenderer,
	MessageRenderOptions,
	ProviderConfig,
	ProviderModelConfig,
	ReadToolCallEvent,
	RegisteredCommand,
	RegisteredTool,
	SessionBeforeCompactEvent,
	SessionBeforeForkEvent,
	SessionBeforeSwitchEvent,
	SessionBeforeTreeEvent,
	SessionCompactEvent,
	SessionForkEvent,
	SessionShutdownEvent,
	SessionStartEvent,
	SessionSwitchEvent,
	SessionTreeEvent,
	TerminalInputHandler,
	ToolCallEvent,
	ToolDefinition,
	ToolInfo,
	ToolRenderResultOptions,
	ToolResultEvent,
	TurnEndEvent,
	TurnStartEvent,
	UserBashEvent,
	UserBashEventResult,
	WidgetPlacement,
	WriteToolCallEvent,
} from "./extensions/index.js";
export {
	bindExtensionRuntimeActions,
	createExtensionRuntime,
	discoverAndLoadExtensions,
	ExtensionRunner,
	isBashToolResult,
	isDirTreeToolResult,
	isEditToolResult,
	isFindToolResult,
	isGlobToolResult,
	isGrepToolResult,
	isLsToolResult,
	isReadToolResult,
	isToolCallEventType,
	isWriteToolResult,
	type SlashCommandInfo,
	type SlashCommandLocation,
	type SlashCommandSource,
	wrapRegisteredTool,
	wrapRegisteredTools,
	wrapToolsWithExtensions,
	wrapToolWithExtensions,
} from "./extensions/index.js";
export { createAgentCliBootstrap } from "./host/coding-agent-cli-bootstrap.js";
export type {
	CodingAgentExtensionBootstrapContributions,
	CodingAgentExtensionCompatibilityAssessment,
	CodingAgentExtensionEventCompatibilityProfile,
	CodingAgentExtensionEventCompatibilityStatus,
	CodingAgentExtensionEventType,
	CodingAgentExtensionRegistrationSummary,
	CodingAgentLegacyExtensionRuntimeCapability,
} from "./host/coding-agent-extension-compatibility.js";
export { resolveCodingAgentGreenfieldExtensionCompatibility } from "./host/coding-agent-extension-compatibility.js";
export {
	type CodingAgentHostBootstrap,
	type CodingAgentHostBootstrapDiagnostics,
	type CodingAgentHostBootstrapOptions,
	type CodingAgentInitialModelResolution,
	createCodingAgentHostBootstrap,
	resolveCodingAgentInitialModel,
} from "./host/coding-agent-host-bootstrap.js";
export {
	convertToLlm,
	PROMPT_ATTACHMENT_CONTEXT_TYPE,
	PROMPT_ATTACHMENT_REFERENCE_TYPE,
	PROMPT_RESOURCE_REFERENCE_TYPE,
} from "./model-context/index.js";
// Run modes for programmatic SDK usage
export {
	computeGreenfieldRpcSessionStats,
	exportGreenfieldRpcConversation,
	GREENFIELD_FULL_RPC_PROFILE,
	GREENFIELD_IM_RPC_PROFILE,
	GreenfieldRpcBashCapability,
	GreenfieldRpcRetryController,
	type GreenfieldRpcRetryEvent,
	type GreenfieldRpcRetrySettings,
	type ImHostBridge,
	type PrintModeOptions,
	type RpcBashResult,
	type RpcSessionCapabilities,
	type RpcSessionInitialization,
	type RpcSessionProfile,
	type RpcSessionProfileId,
	type RpcSessionState,
	type RunRpcModeOptions,
	readGreenfieldRpcAgentMessages,
	resolveNextGreenfieldRpcThinkingLevel,
	runPrintMode,
	runRpcModeWithCapabilities,
} from "./modes/index.js";
// Theme utilities for custom tools and extensions (terminal rendering helpers removed with the TUI product)
export {
	getLanguageFromPath,
	highlightCode,
	initTheme,
	Theme,
	type ThemeColor,
} from "./modes/interactive/theme/theme.js";
// 工作模式（agent_mode 正交轴，见 ADR-0046）
// 对话场景与工具 scope（隔离的唯一轴）
export {
	type AgentMode,
	ALL_AGENT_MODES,
	ALL_SCENARIOS,
	type ConversationScenario,
	DEFAULT_AGENT_MODE,
	DEFAULT_PERSONA_ID,
	DEFAULT_SCENARIO,
	getPersonaPrompt,
	isAgentMode,
	matchesAgentMode,
	PERSONAS,
	type Persona,
	type ToolCapability,
	type ToolCategory,
} from "./profiles/index.js";
// Skills
export {
	formatSkillsForPrompt,
	type LoadSkillsFromDirOptions,
	type LoadSkillsResult,
	loadSkills,
	loadSkillsFromDir,
	type Skill,
	type SkillFrontmatter,
} from "./resources/skills/index.js";
// Clipboard utilities
export { copyToClipboard } from "./utils/clipboard.js";
export { parseFrontmatter, stripFrontmatter } from "./utils/frontmatter.js";
// Shell utilities
export {
	decodeTextBuffer,
	getDefaultShellCommandPrefix,
	getShellConfig,
	isWindowsPowerShellShell,
	prependCommandPrefixes,
	WINDOWS_POWERSHELL_UTF8_COMMAND_PREFIX,
} from "./utils/shell.js";
