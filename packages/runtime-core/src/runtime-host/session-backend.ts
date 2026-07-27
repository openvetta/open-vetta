import {
	type AgentSession,
	type CreateAgentSessionOptions,
	createAgentSession,
	type ModelRegistry,
	SessionManager,
} from "@vetta/coding-agent";
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
import { buildSandboxToolDefinitions } from "../execution-mode/sandbox-tools.js";
import {
	createLegacyRuntimeSessionCorePorts,
	LegacyRuntimeSessionBackgroundWorkController,
	LegacyRuntimeSessionConfigurationController,
	LegacyRuntimeSessionExecutionController,
	LegacyRuntimeSessionHistoryController,
	LegacyRuntimeSessionHistoryReader,
	LegacyRuntimeSessionHostInteraction,
	LegacyRuntimeSessionIdentityLifecycle,
	LegacyRuntimeSessionModelController,
	LegacyRuntimeSessionModelView,
	LegacyRuntimeSessionTodoController,
	LegacyRuntimeSessionWorkspaceView,
} from "./legacy-session-ports.js";
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

/**
 * 当前生产会话在 RuntimeHost 内部使用的会话合同。
 *
 * 这一别名把旧 coding-agent 类型限制在兼容适配层；后续迁移会按事件、历史与
 * 外围能力逐步收窄合同，而不是一次性引入覆盖所有职责的巨型接口。
 */
export type RuntimeSession = AgentSession;

/** 旧 create-only Backend 的兼容参数；仅由 Legacy Composition Adapter 组装。 */
export type RuntimeSessionCreateOptions = CreateAgentSessionOptions;

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
 *
 * 裸类型参数继续表示现有 RuntimeHost 使用的旧会话；Greenfield 组合根可显式
 * 指定自己的创建参数和会话门面，不需要伪装成 coding-agent AgentSession。
 */
export interface RuntimeSessionBackend<TCreateOptions = RuntimeSessionCreateOptions, TSession = RuntimeSession> {
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

/** 将旧 create-only Backend 限制在兼容边界，RuntimeHost 不再自行判断 Session 实现。 */
export class RuntimeSessionBackendAssemblyAdapter implements RuntimeHostSessionBackend {
	constructor(
		private readonly backend: RuntimeSessionBackend,
		private readonly modelRegistry?: ModelRegistry,
	) {}

	async createAssembly(request: RuntimeSessionCreateRequest): Promise<RuntimeHostSessionAssembly> {
		const options = createLegacySessionOptions(request, this.modelRegistry);
		const session = await this.backend.create(options);
		return createLegacyRuntimeHostSessionAssembly(session);
	}
}

export function asRuntimeHostSessionBackend(
	backend: RuntimeSessionBackend | RuntimeHostSessionBackend,
	modelRegistry?: ModelRegistry,
): RuntimeHostSessionBackend {
	return isRuntimeHostSessionBackend(backend)
		? backend
		: new RuntimeSessionBackendAssemblyAdapter(backend, modelRegistry);
}

/** 保留现有生产行为的 coding-agent 兼容后端。 */
export class LegacyCodingAgentSessionBackend implements RuntimeSessionBackend, RuntimeHostSessionBackend {
	constructor(private readonly modelRegistry?: ModelRegistry) {}

	async create(options: RuntimeSessionCreateOptions): Promise<RuntimeSession> {
		const { session } = await createAgentSession(options);
		return session;
	}

	async createAssembly(request: RuntimeSessionCreateRequest): Promise<RuntimeHostSessionAssembly> {
		const options = createLegacySessionOptions(request, this.modelRegistry);
		const session = await this.create(options);
		return createLegacyRuntimeHostSessionAssembly(session);
	}
}

export function createLegacyRuntimeHostSessionAssembly(session: RuntimeSession): RuntimeHostSessionAssembly {
	return {
		lifecycle: new LegacyRuntimeSessionIdentityLifecycle(session),
		historyReader: new LegacyRuntimeSessionHistoryReader(session),
		historyController: new LegacyRuntimeSessionHistoryController(session),
		hostInteraction: new LegacyRuntimeSessionHostInteraction(session),
		executionController: new LegacyRuntimeSessionExecutionController(session),
		workspaceView: new LegacyRuntimeSessionWorkspaceView(session),
		backgroundWorkController: new LegacyRuntimeSessionBackgroundWorkController(session),
		todoController: new LegacyRuntimeSessionTodoController(session),
		configurationController: new LegacyRuntimeSessionConfigurationController(session),
		modelController: new LegacyRuntimeSessionModelController(session),
		modelView: new LegacyRuntimeSessionModelView(session),
		corePorts: createLegacyRuntimeSessionCorePorts(session),
	};
}

function isRuntimeHostSessionBackend(
	backend: RuntimeSessionBackend | RuntimeHostSessionBackend,
): backend is RuntimeHostSessionBackend {
	return "createAssembly" in backend && typeof backend.createAssembly === "function";
}

function createLegacySessionOptions(
	request: RuntimeSessionCreateRequest,
	modelRegistry: ModelRegistry | undefined,
): RuntimeSessionCreateOptions {
	const sessionManager =
		request.sessionPath && request.sessionPath.trim().length > 0
			? SessionManager.open(request.sessionPath)
			: request.cwd
				? SessionManager.create(request.cwd, request.sessionDir)
				: undefined;
	const customTools =
		request.executionMode === "sandbox"
			? buildSandboxToolDefinitions({
					cwd: request.cwd ?? process.cwd(),
					windowsSandboxHostPath: request.sandboxHostPath,
					linuxBubblewrapPath: request.linuxBubblewrapPath,
					macosSandboxExecPath: request.macosSandboxExecPath,
					getSessionId: request.getSessionId,
				})
			: undefined;
	return {
		cwd: request.cwd,
		agentDir: request.agentDir,
		sessionManager,
		model: request.model,
		thinkingLevel: request.thinkingLevel,
		scenario: request.scenario,
		agentMode: request.agentMode,
		customTools,
		appendSystemPrompt: request.appendSystemPrompt,
		env: request.env,
		enableBackgroundTasks: request.enableBackgroundTasks,
		enableSubagents: request.enableSubagents,
		includeAgentSkills: request.includeAgentSkills,
		agentPlugins: request.agentPlugins,
		invokePluginTool: request.invokePluginTool,
		invokePluginContinuation: request.invokePluginContinuation,
		invokePluginSystemPrompt: request.invokePluginSystemPrompt,
		askUserQuestion: request.askUserQuestion,
		serverUrl: request.serverUrl,
		modelRegistry,
	};
}
