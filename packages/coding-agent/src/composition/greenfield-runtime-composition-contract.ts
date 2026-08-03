import type { Message } from "@vetta/ai";
import type { SessionEndCause, SessionStartSource } from "@vetta/ecosystem-adapter";
import type {
	AgentPluginContinuationInvoker,
	AgentPluginRuntimeConfig,
	AgentPluginSystemPromptInvoker,
	AgentPluginToolInvoker,
	ConversationScenario,
	GreenfieldRuntimeSessionBackend,
	RuntimeSessionAskUserQuestionCapability,
	SessionConfig,
	SessionExecutionMode,
} from "@vetta/runtime-core";
import type { AgentCoreTurnEngineOptions, SessionContextRecord } from "@vetta/runtime-core/kernel";
import type { McpRuntimeToolSource } from "@vetta/runtime-mcp";
import type { ConversationOwnershipManager } from "@vetta/runtime-storage/conversation";
import type { CodingToolActivation, CodingToolRegistry } from "@vetta/runtime-tools/coding";
import type {
	CodingAgentCompactionExtensionRuntime,
	CodingAgentGreenfieldContextRuntimeOptions,
	CodingAgentGreenfieldExtensionEventBinding,
	CodingAgentMemoryRolloverOrchestratorOptions,
	CodingAgentMemoryRolloverRuntime,
	CodingAgentModelRegistrySource,
	CodingAgentPluginMcpRuntime,
	CodingAgentPluginRuntimeSource,
	CodingAgentPromptResourceResolver,
	CodingAgentPromptResourceSource,
	CodingAgentPromptSettingsSource,
	CodingAgentSystemPromptOptionsResolver,
	CodingAgentTodoRuntime,
	EcosystemHookAdapterFactory,
	HookConfigLayer,
	KnowledgePageWriterPort,
} from "../adapters/runtime-core/greenfield.js";
import type { ExtensionRunner } from "../core/extensions/runner.js";
import type { Extension } from "../core/extensions/types.js";
import type { TodoLockSource } from "../core/todo-store.js";

export interface GreenfieldRuntimeSessionOptions {
	readonly sessionId: string;
	readonly cwd?: string;
	readonly model?: NonNullable<SessionConfig["model"]>;
	readonly thinkingLevel?: NonNullable<SessionConfig["thinkingLevel"]>;
	readonly agentMode?: string;
	readonly executionMode?: SessionExecutionMode;
	readonly env?: Readonly<Record<string, string>>;
	readonly enableBackgroundTasks?: boolean;
	readonly includeAgentSkills?: boolean;
	readonly agentPlugins?: AgentPluginRuntimeConfig;
	readonly invokePluginTool?: AgentPluginToolInvoker;
	readonly invokePluginContinuation?: AgentPluginContinuationInvoker;
	readonly invokePluginSystemPrompt?: AgentPluginSystemPromptInvoker;
	readonly askUserQuestion?: RuntimeSessionAskUserQuestionCapability;
	readonly sandboxHostPath?: string;
	readonly linuxBubblewrapPath?: string;
	readonly macosSandboxExecPath?: string;
	readonly parentSessionPath?: string;
	readonly parentEntryId?: string;
	readonly memoryMode?: boolean;
	readonly memoryFile?: string;
	readonly memoryCharLimit?: number;
	/** 子 Session 内部 Profile 使用；根宿主无需设置。 */
	readonly systemPromptAddon?: string;
	/** Workflow 子 Session 的父分支只读快照。 */
	readonly forkContextMessages?: readonly Message[];
	/** Workflow 子 Session 的初始 Todo。 */
	readonly initialTodos?: readonly string[];
	/** 产品组合创建初始 Todo 后施加的锁；不会暴露可写 TodoStore 给宿主。 */
	readonly initialTodoLockSource?: TodoLockSource;
	/** 产品会话自己的 Knowledge Writer；普通会话继续使用 Composition 默认实现。 */
	readonly knowledgePageWriter?: KnowledgePageWriterPort;
}

export interface GreenfieldRuntimeCompositionOptions {
	readonly conversationDir: string;
	readonly modelRegistry: CodingAgentModelRegistrySource;
	readonly initialModel: NonNullable<SessionConfig["model"]>;
	readonly initialThinkingLevel: NonNullable<SessionConfig["thinkingLevel"]>;
	readonly cwd?: string;
	readonly agentDir?: string;
	readonly scenario?: ConversationScenario;
	/** 可选的进程级会话所有权；与 Repository 单次写锁相互独立。 */
	readonly conversationOwnershipManager?: ConversationOwnershipManager;
	readonly activation?: CodingToolActivation;
	readonly knowledgeEnabled?: boolean;
	readonly knowledgeRoot?: string;
	/** 仅用于保留宿主既有系统提示词合同；不会把名称对应的工具加入可执行 Tool Frame。 */
	readonly systemPromptAdvertisedToolNames?: readonly string[];
	readonly mcpSource?: McpRuntimeToolSource;
	readonly streamFn?: AgentCoreTurnEngineOptions["streamFn"];
	readonly tokenBudget?: number;
	readonly reservedOutputTokens?: number;
	/** 仅 Root Profile 启用；子 Session 必须显式关闭，保持单层委派。 */
	readonly enableSubagents?: boolean;
	readonly subagentMaxConcurrent?: number;
	/** 已由宿主 Bootstrap 加载的共享动态资源；必须与 promptSettingsSource 同时提供。 */
	readonly promptResourceSource?: CodingAgentPromptResourceSource;
	/** 已由宿主 Bootstrap 加载的共享设置；必须与 promptResourceSource 同时提供。 */
	readonly promptSettingsSource?: CodingAgentPromptSettingsSource;
	/** 优先使用会话工厂，避免有状态 ResourceLoader / TodoStore 被多个 Session 共享。 */
	readonly createPromptResourceResolver?: (
		sessionOptions: GreenfieldRuntimeSessionOptions,
		todoRuntime: CodingAgentTodoRuntime,
	) => CodingAgentPromptResourceResolver;
	/** 无状态解析器的兼容入口。 */
	readonly resolvePromptResource?: CodingAgentPromptResourceResolver;
	/** 为每个 Session 创建调用级系统提示词来源。 */
	readonly createSystemPromptOptionsResolver?: (
		sessionOptions: GreenfieldRuntimeSessionOptions,
	) => CodingAgentSystemPromptOptionsResolver;
	/** 无状态系统提示词来源的兼容入口。 */
	readonly resolveSystemPromptOptions?: CodingAgentSystemPromptOptionsResolver;
	/** 为每个 Session 绑定动态 Plugin Provider 与 Continuation bridge。 */
	readonly createPluginRuntime?: (
		sessionOptions: GreenfieldRuntimeSessionOptions,
	) => CodingAgentPluginRuntimeSource | undefined;
	/** 已由宿主加载的 Extension Tool 注册；只在 Coding Agent 调用级 Frame 中物化。 */
	readonly extensionTools?: readonly Extension[];
	/** 为每个 Session 创建仅承载插件动态 Server 的 MCP Runtime；不得复用共享文件 MCP Source。 */
	readonly createPluginMcpRuntime?: (context: {
		readonly cwd: string;
		readonly agentDir?: string;
		readonly sessionOptions: GreenfieldRuntimeSessionOptions;
	}) => Promise<CodingAgentPluginMcpRuntime>;
	/** 为每个 Session 创建唯一 Todo Runtime；Tool、Continuation、Scene 与 Controller 共享它。 */
	readonly createTodoRuntime?: (sessionOptions: GreenfieldRuntimeSessionOptions) => CodingAgentTodoRuntime;
	/** 追加到每个 Session 内置 Codex/Claude Hook Adapter 之后。 */
	readonly additionalHookAdapterFactories?: readonly EcosystemHookAdapterFactory[];
	/** 显式 Hook 配置层；未提供时由内置 Adapter 使用各自默认发现规则。 */
	readonly hookConfigLayers?: readonly HookConfigLayer[];
	readonly maxStopHookContinuations?: number;
	/** 运行中读取压缩设置；未提供时使用 Coding Agent 既有默认值。 */
	readonly resolveCompactionSettings?: CodingAgentGreenfieldContextRuntimeOptions["resolveSettings"];
	/** 为每个 Session 创建旧 Extension 压缩事件的窄适配器。 */
	readonly createCompactionExtensionRuntime?: (
		sessionOptions: GreenfieldRuntimeSessionOptions,
	) => CodingAgentCompactionExtensionRuntime | undefined;
	/** 测试或宿主可替换摘要调用；生产默认复用 Coding Agent 既有实现。 */
	readonly generateCompaction?: CodingAgentGreenfieldContextRuntimeOptions["generateCompaction"];
	/** 为每个 memory-mode Session 创建产品级 Memory Runtime；默认使用 Coding Agent 既有实现。 */
	readonly createMemoryRolloverRuntime?: (
		options: CodingAgentMemoryRolloverOrchestratorOptions,
		sessionOptions: GreenfieldRuntimeSessionOptions,
	) => CodingAgentMemoryRolloverRuntime;
}

/** @deprecated 使用宿主无关的 GreenfieldRuntimeSessionOptions。 */
export type GreenfieldCliSessionOptions = GreenfieldRuntimeSessionOptions;

export interface GreenfieldRuntimeSessionHookLifecycle {
	end(sessionId: string, cause: SessionEndCause): Promise<void>;
	start(sessionId: string, source: SessionStartSource): void;
	discard(sessionId: string): void;
}

export interface GreenfieldRuntimeSessionControls {
	readonly sessionHooks: GreenfieldRuntimeSessionHookLifecycle;
	appendSessionContext(sessionId: string, records: readonly SessionContextRecord[]): void;
	deliverSessionContext(sessionId: string, records: readonly SessionContextRecord[]): Promise<void>;
	quiesceSessionBackgroundCommands(sessionId: string): Promise<void>;
	preserveSessionExecutionContext(sourceSessionId: string, targetSessionId: string): Promise<void>;
	clearSessionExecutionContext(sessionId: string): void;
	flushMemory(sessionId: string, signal?: AbortSignal): Promise<number>;
}

export interface GreenfieldRuntimeExtensionControls {
	bindExtensionRunner(
		sessionId: string,
		runner: ExtensionRunner,
		options?: { readonly replaceExisting?: boolean },
	): CodingAgentGreenfieldExtensionEventBinding;
	refreshExtensionTools(extensions: readonly Extension[]): void;
}

/** 宿主可动态管理的 Runtime Tool Port；Composition 内部实现与生命周期不向外暴露。 */
export interface GreenfieldRuntimeToolAccess {
	readonly registry: CodingToolRegistry;
}

export interface GreenfieldRuntimeComposition
	extends GreenfieldRuntimeSessionControls,
		GreenfieldRuntimeExtensionControls {
	readonly backend: GreenfieldRuntimeSessionBackend<GreenfieldRuntimeSessionOptions>;
	readonly tools: GreenfieldRuntimeToolAccess;
	readonly scenario: ConversationScenario;
	dispose(): Promise<void>;
}
