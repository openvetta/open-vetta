import type { ThinkingLevel } from "@vetta/agent-core";
import type { Api, Model } from "@vetta/ai";
import type { EcosystemHookAdapterFactory } from "@vetta/ecosystem-adapter";
import type {
	AgentPluginContinuationInvoker,
	AgentPluginRuntimeConfig,
	AgentPluginSystemPromptInvoker,
	AgentPluginToolInvoker,
	ConversationScenario,
} from "@vetta/runtime-core";
import type { RuntimeTracer } from "@vetta/runtime-telemetry";
import type { CodingAgentSession, CodingAgentSessionToolDefinition } from "./sdk-session-contract.js";

export type CodingAgentSessionStorageTarget =
	| { readonly kind: "memory"; readonly sessionId?: string }
	| {
			readonly kind: "file-create";
			readonly conversationDir: string;
			readonly sessionId?: string;
	  }
	| {
			readonly kind: "file-resume";
			readonly conversationDir: string;
			readonly sessionPath: string;
	  };

export interface CodingAgentQuestionOption {
	readonly label: string;
	readonly description: string;
	readonly badges?: readonly string[];
}

export interface CodingAgentQuestionItem {
	readonly question: string;
	readonly header: string;
	readonly options: readonly CodingAgentQuestionOption[];
	readonly multiSelect?: boolean;
}

export interface CodingAgentQuestionRequest {
	readonly questions: readonly CodingAgentQuestionItem[];
}

export interface CodingAgentQuestionAnswer {
	readonly question: string;
	readonly answers: readonly string[];
}

export interface CodingAgentQuestionResult {
	readonly cancelled: boolean;
	readonly answers: readonly CodingAgentQuestionAnswer[];
}

/** 宿主提供的实时提问能力，不暴露具体 UI 实现。 */
export interface CodingAgentQuestionCapability {
	isEnabled(): boolean;
	ask(request: CodingAgentQuestionRequest, signal?: AbortSignal): Promise<CodingAgentQuestionResult>;
}

/**
 * 新公共 SDK 的值对象和窄能力参数。
 *
 * 具体认证、模型、设置、资源和存储管理器只属于产品 Composition Root，
 * 不进入该合同。需要旧管理器注入的调用方继续使用包根兼容工厂。
 */
export interface CreateCodingAgentSessionOptions {
	readonly cwd?: string;
	readonly agentDir?: string;
	readonly storage?: CodingAgentSessionStorageTarget;
	readonly model?: Model<Api>;
	readonly thinkingLevel?: ThinkingLevel;
	readonly scopedModels?: readonly { readonly model: Model<Api>; readonly thinkingLevel: ThinkingLevel }[];
	/** 显式激活的内置工具名；不传时由 scenario 解析。 */
	readonly activeTools?: readonly string[];
	readonly scenario?: ConversationScenario;
	readonly agentMode?: string;
	readonly customTools?: readonly CodingAgentSessionToolDefinition[];
	readonly additionalHookAdapterFactories?: readonly EcosystemHookAdapterFactory[];
	readonly appendSystemPrompt?: string;
	readonly includeAgentSkills?: boolean;
	readonly env?: Readonly<Record<string, string>>;
	readonly memoryMode?: boolean;
	readonly memoryFile?: string;
	readonly memoryCharLimit?: number;
	readonly askUserQuestion?: CodingAgentQuestionCapability;
	readonly enableBackgroundTasks?: boolean;
	readonly enableSubagents?: boolean;
	readonly subagentMaxConcurrent?: number;
	readonly enableMcp?: boolean;
	readonly serverUrl?: string;
	readonly tracer?: RuntimeTracer;
	readonly tracingTraceName?: string;
	readonly tracingMetadata?: Readonly<Record<string, unknown>>;
	readonly agentPlugins?: AgentPluginRuntimeConfig;
	readonly invokePluginTool?: AgentPluginToolInvoker;
	readonly invokePluginContinuation?: AgentPluginContinuationInvoker;
	readonly invokePluginSystemPrompt?: AgentPluginSystemPromptInvoker;
}

export interface CodingAgentSessionDiagnostic {
	readonly code: "extension_load_failed";
	readonly severity: "error";
	readonly source: string;
	readonly message: string;
}

export interface CreateCodingAgentSessionResult {
	readonly session: CodingAgentSession;
	readonly diagnostics: readonly CodingAgentSessionDiagnostic[];
	readonly modelFallbackMessage?: string;
}

export const CODING_AGENT_SESSION_CREATE_ERROR_CODES = {
	INVALID_ACTIVE_TOOL: "coding_agent_sdk_invalid_active_tool",
	NO_MODEL: "coding_agent_sdk_no_model",
} as const;

export type CodingAgentSessionCreateErrorCode =
	(typeof CODING_AGENT_SESSION_CREATE_ERROR_CODES)[keyof typeof CODING_AGENT_SESSION_CREATE_ERROR_CODES];

export class CodingAgentSessionCreateError extends Error {
	constructor(
		readonly code: CodingAgentSessionCreateErrorCode,
		message: string,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = "CodingAgentSessionCreateError";
	}
}
