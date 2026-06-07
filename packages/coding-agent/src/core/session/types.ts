/**
 * Public types for AgentSession.
 *
 * Extracted from agent-session.ts. Re-exported from there to preserve the
 * existing import paths for external consumers.
 */

import type { Agent, AgentEvent, AgentTool, ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { ImageContent, Model } from "@mariozechner/pi-ai";
import type { CompactionResult } from "../compaction/index.js";
import type {
	ExtensionCommandContextActions,
	ExtensionErrorListener,
	ExtensionRunner,
	ExtensionUIContext,
	InputSource,
	ShutdownHandler,
	ToolDefinition,
} from "../extensions/index.js";
import type { ModelRegistry } from "../model-registry.js";
import type { ResourceLoader } from "../resource-loader.js";
import type { SessionManager } from "../session-manager.js";
import type { SettingsManager } from "../settings-manager.js";
import type { TodoItem } from "../todo-store.js";
import type { AskUserQuestionCapability } from "../tools/index.js";

/** Session-specific events that extend the core AgentEvent */
export type AgentSessionEvent =
	| AgentEvent
	| { type: "auto_compaction_start"; reason: "threshold" | "overflow" }
	| {
			type: "auto_compaction_end";
			result: CompactionResult | undefined;
			aborted: boolean;
			willRetry: boolean;
			errorMessage?: string;
	  }
	| { type: "auto_retry_start"; attempt: number; maxAttempts: number; delayMs: number; errorMessage: string }
	| { type: "auto_retry_end"; success: boolean; attempt: number; finalError?: string }
	| { type: "todo_update"; items: ReadonlyArray<TodoItem> }
	| { type: "mcp_reload_start" }
	| { type: "mcp_reload_end"; changed: boolean; errorMessage?: string }
	// memory-mode session rollover (ADR-0009): the active session jsonl changed.
	// The host (im-gateway) repoints its routing state at `to`.
	| { type: "session_path_changed"; from: string | undefined; to: string; reason: "rollover" };

/** Listener function for agent session events */
export type AgentSessionEventListener = (event: AgentSessionEvent) => void;

export interface AgentSessionConfig {
	agent: Agent;
	sessionManager: SessionManager;
	settingsManager: SettingsManager;
	cwd: string;
	/** Models to cycle through with Ctrl+P (from --models flag) */
	scopedModels?: Array<{ model: Model<any>; thinkingLevel: ThinkingLevel }>;
	/** Resource loader for skills, prompts, themes, context files, system prompt */
	resourceLoader: ResourceLoader;
	/** SDK custom tools registered outside extensions */
	customTools?: ToolDefinition[];
	/** Model registry for API key resolution and model discovery */
	modelRegistry: ModelRegistry;
	/** Initial active built-in tool names. Default: [read, command-tool, edit, write] */
	initialActiveToolNames?: string[];
	/** Override base tools (useful for custom runtimes). */
	baseToolsOverride?: Record<string, AgentTool>;
	/** Mutable ref used by Agent to access the current ExtensionRunner */
	extensionRunnerRef?: { current?: ExtensionRunner };
	/** Enable MCP (Model Context Protocol) support (default: true) */
	enableMcp?: boolean;
	/** Enable MCP debug logging (default: false) */
	mcpDebug?: boolean;
	/**
	 * 注入到 bash/shell 工具子进程的环境变量覆盖层（合并到默认 shell env 之上）。
	 * 用于把 TMPDIR/TEMP/TMP 等系统级路径重定向到 session 私有目录。
	 */
	envOverlay?: Record<string, string>;
	/**
	 * memory-mode：启用 MEMORY.md 跨会话记忆注入 + memory 工具 + session
	 * rollover + 日期工作史（ADR-0009）。仅 im-gateway 为 Claw cwd 启用，默认关。
	 */
	memoryMode?: boolean;
	/** MEMORY.md 的绝对路径（run cwd 无关的稳定位置）。memoryMode 下必填。 */
	memoryFile?: string;
	/** MEMORY.md 字符预算（默认 DEFAULT_MEMORY_CHAR_LIMIT）。 */
	memoryCharLimit?: number;
	/**
	 * 宿主提供的「向用户提问」能力（ask_user_question 工具的后端）。
	 * `isEnabled()` 在每个 prompt 入口被实时读取——能力存在与否即工具是否注册，
	 * 故开关可在不重启 session 的情况下动态生效。
	 */
	askUserQuestion?: AskUserQuestionCapability;
}

export interface ExtensionBindings {
	uiContext?: ExtensionUIContext;
	commandContextActions?: ExtensionCommandContextActions;
	shutdownHandler?: ShutdownHandler;
	onError?: ExtensionErrorListener;
}

/** Options for AgentSession.prompt() */
export interface PromptOptions {
	/** Whether to expand file-based prompt templates (default: true) */
	expandPromptTemplates?: boolean;
	/** Image attachments */
	images?: ImageContent[];
	/** When streaming, how to queue the message: "steer" (interrupt) or "followUp" (wait). Required if streaming. */
	streamingBehavior?: "steer" | "followUp";
	/** Source of input for extension input event handlers. Defaults to "interactive". */
	source?: InputSource;
}
