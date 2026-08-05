/**
 * Core modules shared between all run modes.
 */

export type { PromptAttachmentRef } from "@vetta/runtime-core";
export type { CompactionResult } from "../compaction/index.js";
// Extensions system
export {
	type AgentEndEvent,
	type AgentStartEvent,
	type AgentToolResult,
	type AgentToolUpdateCallback,
	type BeforeAgentStartEvent,
	type ContextEvent,
	discoverAndLoadExtensions,
	type ExecOptions,
	type ExecResult,
	type Extension,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	type ExtensionError,
	type ExtensionEvent,
	type ExtensionFactory,
	type ExtensionFlag,
	type ExtensionHandler,
	ExtensionRunner,
	type ExtensionShortcut,
	type ExtensionUIContext,
	type LoadExtensionsResult,
	type MessageRenderer,
	type RegisteredCommand,
	type SessionBeforeCompactEvent,
	type SessionBeforeForkEvent,
	type SessionBeforeSwitchEvent,
	type SessionBeforeTreeEvent,
	type SessionCompactEvent,
	type SessionForkEvent,
	type SessionShutdownEvent,
	type SessionStartEvent,
	type SessionSwitchEvent,
	type SessionTreeEvent,
	type ToolCallEvent,
	type ToolDefinition,
	type ToolRenderResultOptions,
	type ToolResultEvent,
	type TurnEndEvent,
	type TurnStartEvent,
	wrapToolsWithExtensions,
} from "../extensions/index.js";
export {
	type AgentMode,
	ALL_AGENT_MODES,
	ALL_SCENARIOS,
	type ConversationScenario,
	DEFAULT_AGENT_MODE,
	DEFAULT_SCENARIO,
	isAgentMode,
	matchesAgentMode,
	type ToolCapability,
	type ToolCategory,
} from "../profiles/index.js";
export { createEventBus, type EventBus, type EventBusController } from "./event-bus.js";
