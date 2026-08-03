import type { AgentMessage, ThinkingLevel } from "@vetta/agent-core";
import { type Api, type AssistantMessage, type Model, modelsAreEqual, supportsXhigh } from "@vetta/ai";
import type { GreenfieldRuntimeSession, PromptRequest, RuntimeSessionInputQueueMode } from "@vetta/runtime-core";
import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import type {
	GreenfieldSdkCustomToolDefinition,
	GreenfieldSdkModelCycleResult,
	GreenfieldSdkRetryEvent,
	GreenfieldSdkScopedModel,
	GreenfieldSdkSessionCapabilityPort,
	GreenfieldSdkSessionStats,
	GreenfieldSdkToolInfo,
} from "../../public-api/sdk/sdk-session-contract.js";
import { projectCodingAgentGreenfieldMessages } from "./greenfield-agent-message-context-projector.js";
import {
	CodingAgentGreenfieldTurnRetryController,
	type CodingAgentGreenfieldTurnRetrySettings,
} from "./greenfield-turn-retry-controller.js";

const THINKING_LEVELS: readonly ThinkingLevel[] = ["off", "minimal", "low", "medium", "high"];
const THINKING_LEVELS_WITH_XHIGH: readonly ThinkingLevel[] = [...THINKING_LEVELS, "xhigh"];

export interface CodingAgentGreenfieldSessionCapabilitySettings {
	setDefaultModelAndProvider(provider: string, modelId: string): void;
	setDefaultThinkingLevel(level: string): void;
	setSteeringMode(mode: RuntimeSessionInputQueueMode): void;
	setFollowUpMode(mode: RuntimeSessionInputQueueMode): void;
	getRetryEnabled(): boolean;
	getRetrySettings(): CodingAgentGreenfieldTurnRetrySettings;
	setRetryEnabled(enabled: boolean): void;
}

export interface CodingAgentGreenfieldSessionCapabilityHostOptions {
	readonly readSession: () => GreenfieldRuntimeSession;
	readonly readAvailableModels?: () => Promise<readonly Model<Api>[]>;
	readonly scopedModels?: readonly GreenfieldSdkScopedModel[];
	readonly initialAgentMode?: string;
	readonly settings?: CodingAgentGreenfieldSessionCapabilitySettings;
	readonly retryController?: CodingAgentGreenfieldTurnRetryController;
	readonly reconfigureCustomTools?: (customTools: readonly GreenfieldSdkCustomToolDefinition[] | undefined) => void;
}

/** SDK 与 RPC 共用的 Session 内操作能力；不拥有 Session，也不执行身份迁移。 */
export class CodingAgentGreenfieldSessionCapabilityHost implements GreenfieldSdkSessionCapabilityPort {
	private scopedModels: GreenfieldSdkScopedModel[];
	private agentMode: string | undefined;
	private readonly retryController: CodingAgentGreenfieldTurnRetryController | undefined;
	private readonly retryListeners = new Set<(event: GreenfieldSdkRetryEvent) => void>();

	constructor(private readonly options: CodingAgentGreenfieldSessionCapabilityHostOptions) {
		this.scopedModels = [...(options.scopedModels ?? [])];
		this.agentMode = options.initialAgentMode;
		const settings = options.settings;
		this.retryController =
			options.retryController ??
			(settings
				? new CodingAgentGreenfieldTurnRetryController({
						readSettings: () => settings.getRetrySettings(),
						setEnabled: (enabled) => settings.setRetryEnabled(enabled),
						emit: (event) => {
							for (const listener of this.retryListeners) listener(event);
						},
					})
				: undefined);
	}

	async prompt(request: PromptRequest): Promise<unknown> {
		const executeInitial = () => this.options.readSession().prompt(request);
		const retryController = this.retryController;
		const result = retryController
			? await retryController.run(executeInitial, () => this.options.readSession().retry(), readFailedTurnMessage)
			: await executeInitial();
		const failure = readFailedTurnMessage(result);
		if (failure) throw new Error(failure);
		return result;
	}

	subscribeRetryEvents(handler: (event: GreenfieldSdkRetryEvent) => void): () => void {
		this.retryListeners.add(handler);
		return () => this.retryListeners.delete(handler);
	}

	readRetryAttempt(): number {
		return this.retryController?.retryAttempt ?? 0;
	}

	readActiveToolNames(): readonly string[] {
		return this.readCore().toolController?.readActiveToolNames() ?? [];
	}

	readAllTools(): readonly GreenfieldSdkToolInfo[] {
		const tools = this.readCore().toolController?.readAvailableTools();
		return tools ? toToolInfo(tools) : [];
	}

	setActiveToolNames(toolNames: readonly string[]): void {
		const controller = this.readCore().toolController;
		if (!controller) throw new Error("Greenfield session tool capability is unavailable");
		controller.setActiveToolNames(toolNames);
	}

	reconfigureCustomTools(customTools: readonly GreenfieldSdkCustomToolDefinition[] | undefined): void {
		if (!this.options.reconfigureCustomTools) {
			throw new Error("Greenfield session custom tool capability is unavailable");
		}
		this.options.reconfigureCustomTools(customTools);
	}

	readAgentMode(): string | undefined {
		return this.agentMode;
	}

	setAgentMode(mode: string | undefined): void {
		this.readConfigurationController().setAgentMode(mode);
		this.agentMode = mode;
	}

	readIsCompacting(): boolean {
		return this.readContextController().readState().isCompacting;
	}

	readSteeringMode(): RuntimeSessionInputQueueMode {
		return this.readCore().queueController.readSteeringMode();
	}

	readFollowUpMode(): RuntimeSessionInputQueueMode {
		return this.readCore().queueController.readFollowUpMode();
	}

	readSessionName(): string | undefined {
		return this.readCore().metadataController.readName();
	}

	readScopedModels(): readonly GreenfieldSdkScopedModel[] {
		return [...this.scopedModels];
	}

	setScopedModels(scopedModels: readonly GreenfieldSdkScopedModel[]): void {
		this.scopedModels = [...scopedModels];
	}

	clearQueue(): { readonly steering: readonly string[]; readonly followUp: readonly string[] } {
		return this.readCore().queueController.clear();
	}

	readPendingMessageCount(): number {
		return this.readCore().queueController.readPendingMessageCount();
	}

	readSteeringMessages(): readonly string[] {
		return this.readCore().queueController.readSteeringMessages();
	}

	readFollowUpMessages(): readonly string[] {
		return this.readCore().queueController.readFollowUpMessages();
	}

	async selectModel(provider: string, modelId: string): Promise<Model<Api> | undefined> {
		const model = (await this.readAvailableModels()).find(
			(candidate) => candidate.provider === provider && candidate.id === modelId,
		);
		if (!model) return undefined;
		await this.readCore().modelController.selectModel(`${provider}/${modelId}`, "always");
		this.options.settings?.setDefaultModelAndProvider(provider, modelId);
		return this.readCore().modelView.readCurrentModel();
	}

	setThinkingLevel(level: ThinkingLevel): void {
		const core = this.readCore();
		core.modelController.setThinkingLevel(level);
		this.options.settings?.setDefaultThinkingLevel(core.corePorts.stateReader.readState().thinkingLevel);
	}

	async cycleModel(direction: "forward" | "backward" = "forward"): Promise<GreenfieldSdkModelCycleResult | undefined> {
		const core = this.readCore();
		const candidates =
			this.scopedModels.length > 0
				? await this.readUsableScopedModels(core.modelView.resolveApiKey.bind(core.modelView))
				: (await this.readAvailableModels()).map((model) => ({
						model,
						thinkingLevel: core.corePorts.stateReader.readState().thinkingLevel,
					}));
		if (candidates.length <= 1) return undefined;
		const current = core.modelView.readCurrentModel();
		let currentIndex = candidates.findIndex((candidate) => modelsAreEqual(candidate.model, current));
		if (currentIndex === -1) currentIndex = 0;
		const offset = direction === "forward" ? 1 : -1;
		const next = candidates[(currentIndex + offset + candidates.length) % candidates.length];
		await core.modelController.selectModel(`${next.model.provider}/${next.model.id}`, "always");
		core.modelController.setThinkingLevel(next.thinkingLevel);
		const thinkingLevel = core.corePorts.stateReader.readState().thinkingLevel;
		this.options.settings?.setDefaultModelAndProvider(next.model.provider, next.model.id);
		this.options.settings?.setDefaultThinkingLevel(thinkingLevel);
		return { model: next.model, thinkingLevel, isScoped: this.scopedModels.length > 0 };
	}

	cycleThinkingLevel(): ThinkingLevel | undefined {
		const core = this.readCore();
		const state = core.corePorts.stateReader.readState();
		const levels = availableThinkingLevels(core.modelView.readCurrentModel());
		if (levels.length === 1) return undefined;
		const next = levels[(levels.indexOf(state.thinkingLevel) + 1) % levels.length];
		core.modelController.setThinkingLevel(next);
		this.options.settings?.setDefaultThinkingLevel(next);
		return next;
	}

	readAvailableThinkingLevels(): readonly ThinkingLevel[] {
		return availableThinkingLevels(this.readCore().modelView.readCurrentModel());
	}

	supportsXhighThinking(): boolean {
		const model = this.readCore().modelView.readCurrentModel();
		return model ? supportsXhigh(model) : false;
	}

	supportsThinking(): boolean {
		return !!this.readCore().modelView.readCurrentModel()?.reasoning;
	}

	setSteeringMode(mode: RuntimeSessionInputQueueMode): void {
		this.readConfigurationController().setSteeringMode(mode);
		this.options.settings?.setSteeringMode(mode);
	}

	setFollowUpMode(mode: RuntimeSessionInputQueueMode): void {
		this.readConfigurationController().setFollowUpMode(mode);
		this.options.settings?.setFollowUpMode(mode);
	}

	async compact(customInstructions?: string, signal?: AbortSignal) {
		const controller = this.readContextController();
		signal?.throwIfAborted();
		const abort = () => controller.abortCompaction();
		signal?.addEventListener("abort", abort, { once: true });
		try {
			return await controller.compact(customInstructions ? { customInstructions } : undefined);
		} finally {
			signal?.removeEventListener("abort", abort);
		}
	}

	abortCompaction(): void {
		this.readContextController().abortCompaction();
	}

	setAutoCompactionEnabled(enabled: boolean): void {
		this.readContextController().setAutoCompactionEnabled(enabled);
	}

	readAutoCompactionEnabled(): boolean {
		return this.readContextController().readState().autoCompactionEnabled;
	}

	abortRetry(): void {
		this.retryController?.abortRetry();
	}

	readIsRetrying(): boolean {
		return this.retryController?.isRetrying ?? false;
	}

	readAutoRetryEnabled(): boolean {
		return this.options.settings?.getRetryEnabled() ?? false;
	}

	setAutoRetryEnabled(enabled: boolean): void {
		if (this.retryController) {
			this.retryController.setAutoRetryEnabled(enabled);
			return;
		}
		this.options.settings?.setRetryEnabled(enabled);
	}

	setSessionName(name: string): Promise<void> {
		return this.readCore().metadataController.setName(name);
	}

	readSessionStats() {
		const core = this.readCore();
		return computeSessionStats(
			projectCodingAgentGreenfieldMessages(core.conversationView.readDocument()),
			core.lifecycle.sessionPath,
			core.lifecycle.sessionId,
		);
	}

	readContextUsage() {
		return this.readCore().contextUsageView.readContextUsage();
	}

	readLastAssistantText(): string | undefined {
		const messages = projectCodingAgentGreenfieldMessages(this.readCore().conversationView.readDocument());
		for (let index = messages.length - 1; index >= 0; index -= 1) {
			const message = messages[index];
			if (message.role !== "assistant") continue;
			const assistant = message as AssistantMessage;
			if (assistant.stopReason === "aborted" && assistant.content.length === 0) continue;
			const text = assistant.content
				.filter(
					(content): content is Extract<(typeof assistant.content)[number], { readonly type: "text" }> =>
						content.type === "text",
				)
				.map((content) => content.text)
				.join("")
				.trim();
			return text || undefined;
		}
		return undefined;
	}

	readSubagents() {
		return this.readBackgroundWorkController()?.readSubagents() ?? [];
	}

	interruptSubagent(target: string) {
		return this.readBackgroundWorkController()?.interruptSubagent(target);
	}

	clearFinishedSubagents(): number {
		return this.readBackgroundWorkController()?.clearFinishedSubagents?.() ?? 0;
	}

	private readCore(): ReturnType<GreenfieldRuntimeSession["createCoreAssembly"]> {
		return this.options.readSession().createCoreAssembly();
	}

	private readConfigurationController() {
		const controller = this.options.readSession().createRuntimeHostAssemblyCandidate().configurationController;
		if (!controller) throw new Error("Greenfield session configuration capability is unavailable");
		return controller;
	}

	private readContextController() {
		const controller = this.readCore().contextController;
		if (!controller) throw new Error("Greenfield session context capability is unavailable");
		return controller;
	}

	private readBackgroundWorkController() {
		return this.options.readSession().createRuntimeHostAssemblyCandidate().backgroundWorkController;
	}

	private readAvailableModels(): Promise<readonly Model<Api>[]> {
		return this.options.readAvailableModels?.() ?? Promise.resolve(this.readCore().modelView.readAvailableModels());
	}

	private async readUsableScopedModels(
		resolveApiKey: (model: Model<Api>) => Promise<string | undefined>,
	): Promise<GreenfieldSdkScopedModel[]> {
		const usable: GreenfieldSdkScopedModel[] = [];
		for (const scoped of this.scopedModels) {
			if (await resolveApiKey(scoped.model)) usable.push(scoped);
		}
		return usable;
	}
}

function availableThinkingLevels(model: Model<Api> | undefined): readonly ThinkingLevel[] {
	if (!model?.reasoning) return ["off"];
	return supportsXhigh(model) ? THINKING_LEVELS_WITH_XHIGH : THINKING_LEVELS;
}

function toToolInfo(tools: ReadonlyMap<string, RuntimeToolDefinition>): GreenfieldSdkToolInfo[] {
	return [...tools.values()].map((tool) => ({
		name: tool.name,
		description: tool.description,
		parameters: tool.inputSchema,
	}));
}

function computeSessionStats(
	messages: readonly AgentMessage[],
	sessionFile: string | undefined,
	sessionId: string,
): GreenfieldSdkSessionStats {
	let toolCalls = 0;
	let input = 0;
	let output = 0;
	let cacheRead = 0;
	let cacheWrite = 0;
	let cost = 0;
	for (const message of messages) {
		if (message.role !== "assistant") continue;
		const assistant = message as AssistantMessage;
		toolCalls += assistant.content.filter((content) => content.type === "toolCall").length;
		input += assistant.usage.input;
		output += assistant.usage.output;
		cacheRead += assistant.usage.cacheRead;
		cacheWrite += assistant.usage.cacheWrite;
		cost += assistant.usage.cost.total;
	}
	return {
		sessionFile,
		sessionId,
		userMessages: messages.filter((message) => message.role === "user").length,
		assistantMessages: messages.filter((message) => message.role === "assistant").length,
		toolCalls,
		toolResults: messages.filter((message) => message.role === "toolResult").length,
		totalMessages: messages.length,
		tokens: { input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite },
		cost,
	};
}

function readFailedTurnMessage(value: unknown): string | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const error = Reflect.get(value, "error");
	if (
		Reflect.get(value, "status") === "failed" &&
		typeof error === "object" &&
		error !== null &&
		typeof Reflect.get(error, "message") === "string"
	) {
		return Reflect.get(error, "message");
	}
	if (Reflect.get(value, "status") !== "completed" || Reflect.get(value, "stopReason") !== "error") {
		return undefined;
	}
	const messages = Reflect.get(value, "messages");
	if (!Array.isArray(messages)) return "Request failed";
	let assistant: unknown;
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const candidate: unknown = messages[index];
		if (
			typeof candidate === "object" &&
			candidate !== null &&
			Reflect.get(candidate, "role") === "assistant" &&
			Reflect.get(candidate, "stopReason") === "error"
		) {
			assistant = candidate;
			break;
		}
	}
	const message = assistant ? Reflect.get(assistant, "errorMessage") : undefined;
	return typeof message === "string" && message.length > 0 ? message : "Request failed";
}
