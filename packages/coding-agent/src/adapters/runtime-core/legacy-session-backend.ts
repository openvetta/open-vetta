import type {
	RuntimeHostSessionAssembly,
	RuntimeHostSessionBackend,
	RuntimeSessionBackend,
	RuntimeSessionCreateRequest,
} from "@vetta/runtime-core";
import type { AgentSession } from "../../core/agent-session.js";
import type { ModelRegistry } from "../../core/model-registry.js";
import { type CreateAgentSessionOptions, createAgentSession } from "../../core/sdk.js";
import { SessionManager } from "../../core/session-manager/index.js";
import { buildSandboxToolDefinitions } from "./execution-mode/sandbox-tools.js";
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

export type RuntimeSession = AgentSession;

export type RuntimeSessionCreateOptions = CreateAgentSessionOptions;

export class RuntimeSessionBackendAssemblyAdapter implements RuntimeHostSessionBackend {
	constructor(
		private readonly backend: RuntimeSessionBackend<RuntimeSessionCreateOptions, RuntimeSession>,
		private readonly modelRegistry?: ModelRegistry,
	) {}

	async createAssembly(request: RuntimeSessionCreateRequest): Promise<RuntimeHostSessionAssembly> {
		const options = createLegacySessionOptions(request, this.modelRegistry);
		const session = await this.backend.create(options);
		return createLegacyRuntimeHostSessionAssembly(session);
	}
}

export class LegacyCodingAgentSessionBackend
	implements RuntimeSessionBackend<RuntimeSessionCreateOptions, RuntimeSession>, RuntimeHostSessionBackend
{
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
