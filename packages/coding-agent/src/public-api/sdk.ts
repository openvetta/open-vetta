import { createCodingAgentSessionFromPublicOptions } from "../host/coding-agent-sdk-host-adapter.js";
import type { CreateCodingAgentSessionOptions, CreateCodingAgentSessionResult } from "./sdk/index.js";

/** 创建不暴露宿主具体管理器的公共 Coding Agent Session。 */
export function createCodingAgentSession(
	options: CreateCodingAgentSessionOptions = {},
): Promise<CreateCodingAgentSessionResult> {
	return createCodingAgentSessionFromPublicOptions(options);
}

export type {
	CodingAgentActiveSessionCapabilities,
	CodingAgentBashOperations,
	CodingAgentBashResult,
	CodingAgentBranchSummaryEntry,
	CodingAgentFixedSession,
	CodingAgentMemoryConfiguration,
	CodingAgentModelCycleResult,
	CodingAgentNewSessionOptions,
	CodingAgentPromptOptions,
	CodingAgentPromptTemplate,
	CodingAgentQuestionAnswer,
	CodingAgentQuestionCapability,
	CodingAgentQuestionItem,
	CodingAgentQuestionOption,
	CodingAgentQuestionRequest,
	CodingAgentQuestionResult,
	CodingAgentRetryEvent,
	CodingAgentScopedModel,
	CodingAgentSession,
	CodingAgentSessionBranchEntry,
	CodingAgentSessionCapabilities,
	CodingAgentSessionCore,
	CodingAgentSessionCreateErrorCode,
	CodingAgentSessionDiagnostic,
	CodingAgentSessionEvent,
	CodingAgentSessionEventListener,
	CodingAgentSessionSetup,
	CodingAgentSessionStats,
	CodingAgentSessionStorageTarget,
	CodingAgentSessionToolDefinition,
	CodingAgentToolInfo,
	CodingAgentTreeNavigationOptions,
	CodingAgentTreeNavigationResult,
	CreateCodingAgentSessionOptions,
	CreateCodingAgentSessionResult,
} from "./sdk/index.js";
export { CODING_AGENT_SESSION_CREATE_ERROR_CODES, CodingAgentSessionCreateError } from "./sdk/index.js";
