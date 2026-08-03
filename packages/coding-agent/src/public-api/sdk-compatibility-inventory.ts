import type { AgentSession } from "../core/agent-session.js";
import type { CreateAgentSessionOptions, CreateAgentSessionResult } from "../core/sdk.js";

export type SdkCompatibilityDisposition =
	| "greenfield-core"
	| "runtime-capability"
	| "product-adapter"
	| "legacy-concrete";

/**
 * createAgentSession 的迁移清单。`satisfies Record` 让新增或删除 option 必须显式更新分类。
 */
export const SDK_CREATE_OPTION_COMPATIBILITY = {
	cwd: "greenfield-core",
	agentDir: "greenfield-core",
	authStorage: "product-adapter",
	modelRegistry: "product-adapter",
	model: "greenfield-core",
	thinkingLevel: "greenfield-core",
	scopedModels: "runtime-capability",
	tools: "product-adapter",
	scenario: "greenfield-core",
	agentMode: "runtime-capability",
	customTools: "product-adapter",
	additionalHookAdapterFactories: "product-adapter",
	resourceLoader: "legacy-concrete",
	sessionManager: "legacy-concrete",
	settingsManager: "legacy-concrete",
	appendSystemPrompt: "product-adapter",
	includeAgentSkills: "product-adapter",
	env: "greenfield-core",
	memoryMode: "product-adapter",
	memoryFile: "product-adapter",
	memoryCharLimit: "product-adapter",
	askUserQuestion: "runtime-capability",
	enableBackgroundTasks: "product-adapter",
	enableSubagents: "product-adapter",
	subagentTypeRegistry: "product-adapter",
	subagentSessionFactory: "legacy-concrete",
	subagentMaxConcurrent: "product-adapter",
	enableMcp: "product-adapter",
	serverUrl: "product-adapter",
	tracer: "runtime-capability",
	tracingTraceName: "runtime-capability",
	tracingMetadata: "runtime-capability",
	agentPlugins: "product-adapter",
	invokePluginTool: "product-adapter",
	invokePluginContinuation: "product-adapter",
	invokePluginSystemPrompt: "product-adapter",
} as const satisfies Record<keyof CreateAgentSessionOptions, SdkCompatibilityDisposition>;

/** createAgentSession 返回值的兼容责任，避免切换工厂时遗漏非 Session 字段。 */
export const SDK_CREATE_RESULT_COMPATIBILITY = {
	session: "greenfield-core",
	extensionsResult: "product-adapter",
	modelFallbackMessage: "product-adapter",
} as const satisfies Record<keyof CreateAgentSessionResult, SdkCompatibilityDisposition>;

export type SdkCreateOptionWiringStatus = "wired" | "not-wired";

/**
 * SDK 产品宿主的实际接线状态，与字段所属架构层分开记录。
 *
 * `product-adapter` 和 `legacy-concrete` 字段可以由 Host Adapter 转换后接入，但不能因此
 * 改写其架构归属；尚依赖完整 AgentSession 门面的字段继续 fail closed。
 */
export const SDK_CREATE_OPTION_WIRING = {
	cwd: "wired",
	agentDir: "wired",
	authStorage: "wired",
	modelRegistry: "wired",
	model: "wired",
	thinkingLevel: "wired",
	scopedModels: "wired",
	tools: "wired",
	scenario: "wired",
	agentMode: "wired",
	customTools: "wired",
	additionalHookAdapterFactories: "wired",
	resourceLoader: "wired",
	sessionManager: "wired",
	settingsManager: "wired",
	appendSystemPrompt: "wired",
	includeAgentSkills: "wired",
	env: "wired",
	memoryMode: "wired",
	memoryFile: "wired",
	memoryCharLimit: "wired",
	askUserQuestion: "wired",
	enableBackgroundTasks: "wired",
	enableSubagents: "wired",
	subagentTypeRegistry: "wired",
	subagentSessionFactory: "wired",
	subagentMaxConcurrent: "wired",
	enableMcp: "wired",
	serverUrl: "wired",
	tracer: "wired",
	tracingTraceName: "wired",
	tracingMetadata: "wired",
	agentPlugins: "wired",
	invokePluginTool: "wired",
	invokePluginContinuation: "wired",
	invokePluginSystemPrompt: "wired",
} as const satisfies Record<keyof CreateAgentSessionOptions, SdkCreateOptionWiringStatus>;

export interface SdkCreateOptionCompatibilityIssue {
	readonly code: "greenfield_sdk_option_not_wired";
	readonly option: keyof CreateAgentSessionOptions;
	readonly disposition: Exclude<SdkCompatibilityDisposition, "greenfield-core">;
}

export type SdkCreateOptionsCompatibilityAssessment =
	| { readonly compatible: true; readonly issues: readonly [] }
	| { readonly compatible: false; readonly issues: readonly SdkCreateOptionCompatibilityIssue[] };

/**
 * 判断现有公开 options 是否只使用了已闭合的 Greenfield 核心字段。
 *
 * 该结果是公开工厂切换前的准入门禁；外围字段在适配完成前必须显式报告，不能被
 * Greenfield Factory 静默忽略。
 */
export function assessSdkCreateOptionsCompatibility(
	options: CreateAgentSessionOptions,
): SdkCreateOptionsCompatibilityAssessment {
	const issues: SdkCreateOptionCompatibilityIssue[] = [];
	for (const option of Object.keys(SDK_CREATE_OPTION_COMPATIBILITY) as Array<keyof CreateAgentSessionOptions>) {
		if (options[option] === undefined) continue;
		if (SDK_CREATE_OPTION_WIRING[option] === "wired") continue;
		const disposition = SDK_CREATE_OPTION_COMPATIBILITY[option];
		if (disposition === "greenfield-core") continue;
		issues.push({ code: "greenfield_sdk_option_not_wired", option, disposition });
	}
	return issues.length === 0 ? { compatible: true, issues: [] } : { compatible: false, issues };
}

/**
 * 现有 AgentSession 的完整公开成员清单。
 *
 * greenfield-core 已进入第 210 阶段门面；runtime-capability 已有中立 Port 但尚未全部
 * 暴露；product-adapter 需要产品层组合；legacy-concrete 是不能下沉进 Runtime 的旧实现泄漏。
 */
export const SDK_SESSION_MEMBER_COMPATIBILITY = {
	agent: "legacy-concrete",
	sessionManager: "legacy-concrete",
	settingsManager: "legacy-concrete",
	modelRegistry: "product-adapter",
	subagents: "product-adapter",
	listSubagents: "runtime-capability",
	interruptSubagent: "runtime-capability",
	clearFinishedSubagents: "runtime-capability",
	mcpManager: "legacy-concrete",
	subscribe: "greenfield-core",
	dispose: "greenfield-core",
	close: "greenfield-core",
	state: "greenfield-core",
	model: "greenfield-core",
	thinkingLevel: "greenfield-core",
	isStreaming: "greenfield-core",
	systemPrompt: "product-adapter",
	retryAttempt: "runtime-capability",
	getActiveToolNames: "runtime-capability",
	getAllTools: "product-adapter",
	setActiveToolsByName: "runtime-capability",
	reconfigureCustomTools: "product-adapter",
	reconfigureAgentPlugins: "product-adapter",
	agentMode: "runtime-capability",
	setAgentMode: "runtime-capability",
	prepareSystemPromptForAgentRun: "product-adapter",
	isCompacting: "runtime-capability",
	messages: "greenfield-core",
	steeringMode: "runtime-capability",
	followUpMode: "runtime-capability",
	sessionFile: "greenfield-core",
	sessionId: "greenfield-core",
	sessionName: "runtime-capability",
	getSessionBranch: "runtime-capability",
	scopedModels: "runtime-capability",
	setScopedModels: "runtime-capability",
	promptTemplates: "product-adapter",
	todoStore: "legacy-concrete",
	backgroundTasks: "product-adapter",
	memoryMode: "product-adapter",
	memoryFile: "product-adapter",
	memoryCharLimit: "product-adapter",
	prompt: "greenfield-core",
	steer: "greenfield-core",
	followUp: "greenfield-core",
	sendCustomMessage: "runtime-capability",
	sendUserMessage: "runtime-capability",
	clearQueue: "runtime-capability",
	pendingMessageCount: "runtime-capability",
	getSteeringMessages: "runtime-capability",
	getFollowUpMessages: "runtime-capability",
	resourceLoader: "legacy-concrete",
	abort: "greenfield-core",
	newSession: "runtime-capability",
	setModel: "greenfield-core",
	cycleModel: "runtime-capability",
	setThinkingLevel: "greenfield-core",
	cycleThinkingLevel: "runtime-capability",
	getAvailableThinkingLevels: "runtime-capability",
	supportsXhighThinking: "runtime-capability",
	supportsThinking: "runtime-capability",
	setSteeringMode: "runtime-capability",
	setFollowUpMode: "runtime-capability",
	compact: "runtime-capability",
	abortCompaction: "runtime-capability",
	abortBranchSummary: "runtime-capability",
	flushMemory: "product-adapter",
	preCallCompaction: "product-adapter",
	setAutoCompactionEnabled: "runtime-capability",
	autoCompactionEnabled: "runtime-capability",
	bindExtensions: "product-adapter",
	reloadMcp: "product-adapter",
	reload: "product-adapter",
	abortRetry: "runtime-capability",
	isRetrying: "runtime-capability",
	autoRetryEnabled: "runtime-capability",
	setAutoRetryEnabled: "runtime-capability",
	executeBash: "runtime-capability",
	recordBashResult: "legacy-concrete",
	abortBash: "runtime-capability",
	isBashRunning: "runtime-capability",
	hasPendingBashMessages: "runtime-capability",
	switchSession: "runtime-capability",
	setSessionName: "runtime-capability",
	fork: "runtime-capability",
	navigateTree: "runtime-capability",
	switchBranch: "runtime-capability",
	appendBranchSummary: "runtime-capability",
	deleteMessage: "runtime-capability",
	replaceLastUserMessage: "runtime-capability",
	exportForkToNewFile: "runtime-capability",
	getUserMessagesForForking: "runtime-capability",
	getSessionStats: "runtime-capability",
	getContextUsage: "runtime-capability",
	exportToHtml: "product-adapter",
	getLastAssistantText: "runtime-capability",
	hasExtensionHandlers: "product-adapter",
	extensionRunner: "legacy-concrete",
} as const satisfies Record<keyof AgentSession, SdkCompatibilityDisposition>;

export type SdkSessionMemberWiringStatus = "wired" | "not-wired";

/** 固定 Session 门面的实际接线；新增 AgentSession 成员必须在这里作出显式迁移决定。 */
export const SDK_SESSION_MEMBER_WIRING = {
	agent: "not-wired",
	sessionManager: "not-wired",
	settingsManager: "not-wired",
	modelRegistry: "not-wired",
	subagents: "not-wired",
	listSubagents: "wired",
	interruptSubagent: "wired",
	clearFinishedSubagents: "wired",
	mcpManager: "not-wired",
	subscribe: "wired",
	dispose: "wired",
	close: "wired",
	state: "wired",
	model: "wired",
	thinkingLevel: "wired",
	isStreaming: "wired",
	systemPrompt: "not-wired",
	retryAttempt: "wired",
	getActiveToolNames: "wired",
	getAllTools: "wired",
	setActiveToolsByName: "wired",
	reconfigureCustomTools: "wired",
	reconfigureAgentPlugins: "not-wired",
	agentMode: "wired",
	setAgentMode: "wired",
	prepareSystemPromptForAgentRun: "not-wired",
	isCompacting: "wired",
	messages: "wired",
	steeringMode: "wired",
	followUpMode: "wired",
	sessionFile: "wired",
	sessionId: "wired",
	sessionName: "wired",
	getSessionBranch: "wired",
	scopedModels: "wired",
	setScopedModels: "wired",
	promptTemplates: "not-wired",
	todoStore: "not-wired",
	backgroundTasks: "not-wired",
	memoryMode: "not-wired",
	memoryFile: "not-wired",
	memoryCharLimit: "not-wired",
	prompt: "wired",
	steer: "wired",
	followUp: "wired",
	sendCustomMessage: "wired",
	sendUserMessage: "wired",
	clearQueue: "wired",
	pendingMessageCount: "wired",
	getSteeringMessages: "wired",
	getFollowUpMessages: "wired",
	resourceLoader: "not-wired",
	abort: "wired",
	newSession: "wired",
	setModel: "wired",
	cycleModel: "wired",
	setThinkingLevel: "wired",
	cycleThinkingLevel: "wired",
	getAvailableThinkingLevels: "wired",
	supportsXhighThinking: "wired",
	supportsThinking: "wired",
	setSteeringMode: "wired",
	setFollowUpMode: "wired",
	compact: "wired",
	abortCompaction: "wired",
	abortBranchSummary: "wired",
	flushMemory: "not-wired",
	preCallCompaction: "not-wired",
	setAutoCompactionEnabled: "wired",
	autoCompactionEnabled: "wired",
	bindExtensions: "not-wired",
	reloadMcp: "not-wired",
	reload: "not-wired",
	abortRetry: "wired",
	isRetrying: "wired",
	autoRetryEnabled: "wired",
	setAutoRetryEnabled: "wired",
	executeBash: "wired",
	recordBashResult: "not-wired",
	abortBash: "wired",
	isBashRunning: "wired",
	hasPendingBashMessages: "wired",
	switchSession: "wired",
	setSessionName: "wired",
	fork: "wired",
	navigateTree: "wired",
	switchBranch: "wired",
	appendBranchSummary: "wired",
	deleteMessage: "wired",
	replaceLastUserMessage: "wired",
	exportForkToNewFile: "wired",
	getUserMessagesForForking: "wired",
	getSessionStats: "wired",
	getContextUsage: "wired",
	exportToHtml: "not-wired",
	getLastAssistantText: "wired",
	hasExtensionHandlers: "not-wired",
	extensionRunner: "not-wired",
} as const satisfies Record<keyof AgentSession, SdkSessionMemberWiringStatus>;
