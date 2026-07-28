import type {
	AgentPluginContinuationInvoker,
	AgentPluginRuntimeConfig,
	AgentPluginSystemPromptInvoker,
	AgentPluginToolInvoker,
	RuntimeQuestionItem,
	RuntimeUserQuestionResult,
	SessionConfig,
	SessionExecutionMode,
} from "../contracts.js";
import type {
	RuntimeSessionBackgroundWorkController,
	RuntimeSessionConfigurationController,
	RuntimeSessionCorePorts,
	RuntimeSessionExecutionController,
	RuntimeSessionHistoryController,
	RuntimeSessionHistoryReader,
	RuntimeSessionHostInteraction,
	RuntimeSessionIdentityLifecycle,
	RuntimeSessionModelController,
	RuntimeSessionModelView,
	RuntimeSessionTodoController,
	RuntimeSessionWorkspaceView,
} from "./session-ports.js";

export interface RuntimeSessionAskUserQuestionCapability {
	isEnabled(): boolean;
	ask(request: { questions: RuntimeQuestionItem[] }, signal?: AbortSignal): Promise<RuntimeUserQuestionResult>;
}

/** RuntimeHost 到 Session Backend 的实现无关创建请求。 */
export interface RuntimeSessionCreateRequest {
	readonly cwd?: SessionConfig["cwd"];
	readonly agentDir?: SessionConfig["agentDir"];
	readonly sessionPath?: SessionConfig["sessionPath"];
	readonly sessionDir?: SessionConfig["sessionDir"];
	readonly model?: SessionConfig["model"];
	readonly thinkingLevel?: SessionConfig["thinkingLevel"];
	readonly scenario?: SessionConfig["scenario"];
	readonly agentMode?: SessionConfig["agentMode"];
	readonly executionMode: SessionExecutionMode;
	readonly appendSystemPrompt?: SessionConfig["appendSystemPrompt"];
	readonly env?: SessionConfig["env"];
	readonly enableBackgroundTasks?: SessionConfig["enableBackgroundTasks"];
	readonly enableSubagents: boolean;
	readonly includeAgentSkills?: SessionConfig["includeAgentSkills"];
	readonly agentPlugins?: AgentPluginRuntimeConfig;
	readonly invokePluginTool?: AgentPluginToolInvoker;
	readonly invokePluginContinuation?: AgentPluginContinuationInvoker;
	readonly invokePluginSystemPrompt?: AgentPluginSystemPromptInvoker;
	readonly askUserQuestion?: RuntimeSessionAskUserQuestionCapability;
	readonly serverUrl?: string;
	readonly sandboxHostPath?: string;
	readonly linuxBubblewrapPath?: string;
	readonly macosSandboxExecPath?: string;
	readonly getSessionId: () => string | undefined;
}

/**
 * 会话创建后端的通用工厂边界。
 */
export interface RuntimeSessionBackend<TCreateOptions, TSession> {
	create(options: TCreateOptions): Promise<TSession>;
}

export interface RuntimeHostSessionAssembly {
	readonly lifecycle: RuntimeSessionIdentityLifecycle;
	readonly historyReader: RuntimeSessionHistoryReader;
	readonly historyController: RuntimeSessionHistoryController;
	readonly hostInteraction: RuntimeSessionHostInteraction;
	readonly executionController: RuntimeSessionExecutionController;
	readonly workspaceView: RuntimeSessionWorkspaceView;
	readonly backgroundWorkController: RuntimeSessionBackgroundWorkController;
	readonly todoController: RuntimeSessionTodoController;
	readonly configurationController: RuntimeSessionConfigurationController;
	readonly modelController: RuntimeSessionModelController;
	readonly modelView: RuntimeSessionModelView;
	readonly corePorts: RuntimeSessionCorePorts;
}

/** RuntimeHost 的组合根合同：一次创建同时交付外围句柄与基础能力 Port。 */
export interface RuntimeHostSessionBackend {
	createAssembly(request: RuntimeSessionCreateRequest): Promise<RuntimeHostSessionAssembly>;
}
