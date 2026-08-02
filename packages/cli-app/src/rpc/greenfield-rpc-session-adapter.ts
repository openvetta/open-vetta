import type { CodingAgentHostBootstrap } from "@vetta/coding-agent/bootstrap";
import type { CodingAgentTool } from "@vetta/coding-agent/profile";
import {
	computeGreenfieldRpcSessionStats,
	createImSendAttachmentTool,
	exportGreenfieldRpcConversation,
	type GreenfieldRpcRetryController,
	type GreenfieldRpcRetryEvent,
	type RpcRuntimeDecision,
	type RpcSessionCapabilities,
	type RpcSessionInitialization,
	type RpcSessionProfile,
	type RpcSessionState,
	readGreenfieldRpcAgentMessages,
	resolveNextGreenfieldRpcThinkingLevel,
} from "@vetta/coding-agent/rpc";
import {
	adaptCodingAgentToolRegistration,
	type CodingAgentGreenfieldExtensionCommandHost,
} from "@vetta/coding-agent/runtime-host/greenfield";
import { type GreenfieldRuntimeSession, type HistoryEntry, RetryableCleanup } from "@vetta/runtime-core";
import type { CodingToolRegistration } from "@vetta/runtime-tools/coding";
import type {
	CodingAgentGreenfieldActiveSessionHost,
	GreenfieldRuntimeComposition,
} from "../greenfield-runtime-composition.js";
import { GreenfieldRpcEventAdapter } from "./greenfield-rpc-events.js";

type GreenfieldResourceLoader = Pick<CodingAgentHostBootstrap["resourceLoader"], "getPrompts" | "getSkills">;
type GreenfieldCommandDiscoveryCapability = NonNullable<RpcSessionCapabilities["commands"]>;

interface ActiveTurnCommand {
	readonly terminalDeliveries: Array<() => void>;
}

export interface GreenfieldRpcSessionAdapterOptions {
	readonly profile: RpcSessionProfile;
	readonly runtimeBackend: "greenfield" | "greenfield-im";
	readonly sessionHost: Pick<
		CodingAgentGreenfieldActiveSessionHost,
		"dispose" | "fork" | "newSession" | "readSession" | "startActiveSessionOperation" | "subscribe" | "switchSession"
	>;
	readonly runtime: GreenfieldRuntimeComposition;
	readonly resourceLoader: GreenfieldResourceLoader;
	readonly runtimeDecision?: RpcRuntimeDecision;
	readonly retryController?: GreenfieldRpcRetryController;
	readonly bash?: RpcSessionCapabilities["bash"];
	readonly readAvailableModels?: NonNullable<RpcSessionCapabilities["model"]>["readAvailableModels"];
	readonly extensionCommandHost?: Pick<
		CodingAgentGreenfieldExtensionCommandHost,
		"readCommands" | "throwIfExtensionCommand" | "tryExecute"
	>;
	readonly createHostToolRegistration?: (
		hostBridge: NonNullable<RpcSessionInitialization["hostBridge"]>,
	) => CodingToolRegistration;
}

/** Greenfield Runtime 到 RPC capability 合同的中性产品宿主适配器。 */
export class GreenfieldRpcSessionAdapter implements RpcSessionCapabilities {
	readonly profile;
	readonly turn;
	readonly state;
	readonly model;
	readonly queue;
	readonly context;
	readonly memory;
	readonly retry;
	readonly bash;
	readonly session;
	readonly commands: GreenfieldCommandDiscoveryCapability;

	private readonly sessionHost: GreenfieldRpcSessionAdapterOptions["sessionHost"];
	private readonly runtime: GreenfieldRuntimeComposition;
	private readonly resourceLoader: GreenfieldResourceLoader;
	private readonly runtimeBackend: GreenfieldRpcSessionAdapterOptions["runtimeBackend"];
	private readonly runtimeDecision: RpcRuntimeDecision;
	private readonly retryController: GreenfieldRpcRetryController | undefined;
	private readonly readAvailableModels: NonNullable<GreenfieldRpcSessionAdapterOptions["readAvailableModels"]>;
	private readonly extensionCommandHost: GreenfieldRpcSessionAdapterOptions["extensionCommandHost"];
	private readonly createHostToolRegistration: NonNullable<
		GreenfieldRpcSessionAdapterOptions["createHostToolRegistration"]
	>;
	private unregisterHostTool: (() => void) | undefined;
	private initialized = false;
	private readonly activeTurnCommands: ActiveTurnCommand[] = [];
	private readonly supplementalListeners = new Set<(event: unknown) => void>();
	private readonly cleanup = new RetryableCleanup();

	constructor(options: GreenfieldRpcSessionAdapterOptions) {
		this.profile = options.profile;
		this.runtimeBackend = options.runtimeBackend;
		this.sessionHost = options.sessionHost;
		this.runtime = options.runtime;
		this.resourceLoader = options.resourceLoader;
		this.runtimeDecision = options.runtimeDecision ?? {
			requestedBackend: options.runtimeBackend,
			effectiveBackend: options.runtimeBackend,
		};
		this.retryController = options.retryController;
		this.retry = options.retryController;
		this.bash = options.bash;
		this.readAvailableModels =
			options.readAvailableModels ?? (async () => this.readCore().modelView.readAvailableModels());
		this.extensionCommandHost = options.extensionCommandHost;
		this.createHostToolRegistration =
			options.createHostToolRegistration ??
			((hostBridge) =>
				adaptCodingAgentToolRegistration(createImSendAttachmentTool(hostBridge) as unknown as CodingAgentTool));
		this.cleanup.add({
			id: "host-tool",
			phase: 0,
			cleanup: () => {
				const unregister = this.unregisterHostTool;
				if (!unregister) return;
				unregister();
				if (this.unregisterHostTool === unregister) this.unregisterHostTool = undefined;
			},
		});
		this.cleanup.add({ id: "session-host", phase: 1, cleanup: () => this.sessionHost.dispose() });
		this.cleanup.add({ id: "runtime", phase: 2, cleanup: () => this.runtime.dispose() });
		this.turn = {
			prompt: async (message, promptOptions) => {
				if (
					this.extensionCommandHost &&
					(await this.sessionHost.startActiveSessionOperation(() =>
						this.extensionCommandHost!.tryExecute(message),
					))
				) {
					return;
				}
				await this.runTurnCommand(() =>
					this.sessionHost.startActiveSessionOperation((session) =>
						session.prompt({
							text: message,
							images: promptOptions.images,
							streamingBehavior: promptOptions.streamingBehavior,
						}),
					),
				);
			},
			steer: async (message, images) => {
				this.extensionCommandHost?.throwIfExtensionCommand(message);
				await this.runTurnCommand(() =>
					this.sessionHost.startActiveSessionOperation((session) =>
						session.prompt({ text: message, images, streamingBehavior: "steer" }),
					),
				);
			},
			followUp: async (message, images) => {
				this.extensionCommandHost?.throwIfExtensionCommand(message);
				await this.runTurnCommand(() =>
					this.sessionHost.startActiveSessionOperation((session) =>
						session.prompt({ text: message, images, streamingBehavior: "followUp" }),
					),
				);
			},
			abort: () => this.readSession().abort("RPC abort"),
		} satisfies NonNullable<RpcSessionCapabilities["turn"]>;
		this.state = {
			readState: () => this.readRpcState(),
			readMessages: () => readGreenfieldRpcAgentMessages(this.readCore().conversationView.readDocument()),
		} satisfies NonNullable<RpcSessionCapabilities["state"]>;
		this.model = {
			selectModel: async (provider, modelId) => {
				const core = this.readCore();
				const model = (await this.readAvailableModels()).find(
					(candidate) => candidate.provider === provider && candidate.id === modelId,
				);
				if (!model) return undefined;
				await core.modelController.selectModel(`${provider}/${modelId}`, "always");
				return core.modelView.readCurrentModel();
			},
			cycleModel: async () => {
				const core = this.readCore();
				const current = core.modelView.readCurrentModel();
				const models = await this.readAvailableModels();
				if (models.length === 0) return undefined;
				const currentIndex = current
					? models.findIndex((model) => model.provider === current.provider && model.id === current.id)
					: -1;
				const next = models[(currentIndex + 1) % models.length];
				await core.modelController.selectModel(`${next.provider}/${next.id}`, "always");
				const state = core.corePorts.stateReader.readState();
				return { model: next, thinkingLevel: state.thinkingLevel, isScoped: false };
			},
			readAvailableModels: this.readAvailableModels,
			setThinkingLevel: (level) => this.readCore().modelController.setThinkingLevel(level),
			cycleThinkingLevel: () => this.cycleThinkingLevel(),
		} satisfies NonNullable<RpcSessionCapabilities["model"]>;
		this.queue = {
			setSteeringMode: (mode) => this.readConfigurationController().setSteeringMode(mode),
			setFollowUpMode: (mode) => this.readConfigurationController().setFollowUpMode(mode),
		} satisfies NonNullable<RpcSessionCapabilities["queue"]>;
		this.context = {
			compact: async (customInstructions, signal) => {
				const controller = this.readContextController();
				signal?.throwIfAborted();
				const abort = () => controller.abortCompaction();
				signal?.addEventListener("abort", abort, { once: true });
				try {
					return await controller.compact(customInstructions ? { customInstructions } : undefined);
				} finally {
					signal?.removeEventListener("abort", abort);
				}
			},
			setAutoCompactionEnabled: (enabled) => this.readContextController().setAutoCompactionEnabled(enabled),
		} satisfies NonNullable<RpcSessionCapabilities["context"]>;
		this.memory = {
			flushMemory: (signal?: AbortSignal) =>
				signal
					? this.runtime.flushMemory(this.readSession().sessionId, signal)
					: this.runtime.flushMemory(this.readSession().sessionId),
		} satisfies NonNullable<RpcSessionCapabilities["memory"]>;
		this.session = {
			newSession: async (parentSession) =>
				!(await this.sessionHost.newSession(parentSession ? { parentSession } : undefined)).cancelled,
			switchSession: async (sessionPath) => !(await this.sessionHost.switchSession(sessionPath)).cancelled,
			fork: (entryId) => this.sessionHost.fork(entryId),
			readForkMessages: () => readForkMessages(this.readSession()),
			readLastAssistantText: () => readLastAssistantText(this.readSession()),
			setName: (name) => this.readCore().metadataController.setName(name),
			readStats: () => {
				const core = this.readCore();
				return computeGreenfieldRpcSessionStats(
					readGreenfieldRpcAgentMessages(core.conversationView.readDocument()),
					core.lifecycle.sessionPath,
					core.lifecycle.sessionId,
				);
			},
			exportHtml: (outputPath) => {
				const core = this.readCore();
				if (!core.lifecycle.sessionPath) throw new Error("Cannot export an in-memory Greenfield session");
				return exportGreenfieldRpcConversation(
					core.conversationView.readDocument(),
					core.lifecycle.sessionPath,
					outputPath,
				);
			},
		} satisfies NonNullable<RpcSessionCapabilities["session"]>;
		this.commands = {
			readCommands: () => [
				...(this.extensionCommandHost?.readCommands() ?? []),
				...readResourceCommands(this.resourceLoader),
			],
		};
	}

	async initialize(input: RpcSessionInitialization): Promise<void> {
		if (this.initialized) throw new Error(`RPC profile ${this.profile.id} is already initialized`);
		if (!input.hostBridge && this.profile.hostBridge === "required") {
			throw new Error(`RPC profile ${this.profile.id} requires a host bridge`);
		}
		this.initialized = true;
		if (!input.hostBridge) return;
		const registration = this.createHostToolRegistration(input.hostBridge);
		this.runtime.tools.registry.register(registration);
		this.unregisterHostTool = () => this.runtime.tools.registry.unregister(registration.tool.name);
	}

	subscribe(listener: (event: unknown) => void): () => void {
		const adapter = new GreenfieldRpcEventAdapter();
		let subscribed = true;
		this.supplementalListeners.add(listener);
		const unsubscribe = this.sessionHost.subscribe((event) => {
			for (const mapped of adapter.map(event)) {
				const activeTurn = this.activeTurnCommands[0];
				if (isAgentEndFrame(mapped) && activeTurn) {
					activeTurn.terminalDeliveries.push(() => {
						if (subscribed) listener(mapped);
					});
					continue;
				}
				listener(mapped);
			}
		});
		return () => {
			subscribed = false;
			this.supplementalListeners.delete(listener);
			unsubscribe();
		};
	}

	async shutdown(): Promise<void> {}

	async dispose(): Promise<void> {
		this.retryController?.abortRetry();
		this.supplementalListeners.clear();
		try {
			await this.cleanup.run("Failed to dispose Greenfield RPC resources");
		} catch (error) {
			throw new AggregateError(
				error instanceof AggregateError ? error.errors : [error],
				"Failed to dispose Greenfield RPC resources",
			);
		}
	}

	emitSupplementalEvent(event: GreenfieldRpcRetryEvent): void {
		for (const listener of this.supplementalListeners) listener(event);
	}

	private async readRpcState(): Promise<RpcSessionState> {
		const greenfieldSession = this.readSession();
		const core = greenfieldSession.createCoreAssembly();
		const [sessionState, state] = await Promise.all([
			greenfieldSession.getState(),
			Promise.resolve(core.corePorts.stateReader.readState()),
		]);
		const context = core.contextController?.readState();
		return {
			runtimeBackend: this.runtimeBackend,
			runtimeDecision: this.runtimeDecision,
			model: state.model,
			thinkingLevel: state.thinkingLevel,
			isStreaming: state.isStreaming,
			isCompacting: context?.isCompacting ?? false,
			steeringMode: sessionState.steeringMode,
			followUpMode: sessionState.followUpMode,
			sessionFile: core.lifecycle.sessionPath,
			sessionId: sessionState.sessionId,
			sessionName: core.metadataController?.readName(),
			autoCompactionEnabled: context?.autoCompactionEnabled ?? false,
			messageCount: sessionState.messageCount,
			pendingMessageCount: sessionState.pendingMessageCount,
		};
	}

	private readSession(): GreenfieldRuntimeSession {
		return this.sessionHost.readSession();
	}

	private readCore(): ReturnType<GreenfieldRuntimeSession["createCoreAssembly"]> {
		return this.readSession().createCoreAssembly();
	}

	private readConfigurationController() {
		const controller = this.readSession().createRuntimeHostAssemblyCandidate().configurationController;
		if (!controller) throw new Error("Greenfield session configuration capability is unavailable");
		return controller;
	}

	private readContextController() {
		const controller = this.readCore().contextController;
		if (!controller) throw new Error("Greenfield session context capability is unavailable");
		return controller;
	}

	private cycleThinkingLevel(): ReturnType<NonNullable<RpcSessionCapabilities["model"]>["cycleThinkingLevel"]> {
		const core = this.readCore();
		const state = core.corePorts.stateReader.readState();
		const model = core.modelView.readCurrentModel();
		const next = resolveNextGreenfieldRpcThinkingLevel(model, state.thinkingLevel);
		if (!next) return undefined;
		core.modelController.setThinkingLevel(next);
		return next;
	}

	private async runTurnCommand(command: () => Promise<unknown>): Promise<void> {
		const activeTurn: ActiveTurnCommand = { terminalDeliveries: [] };
		this.activeTurnCommands.push(activeTurn);
		let result: unknown;
		let rejection: { readonly error: unknown } | undefined;
		try {
			result = this.retryController
				? await this.retryController.run(
						command,
						() => this.sessionHost.startActiveSessionOperation((session) => session.continue()),
						readFailedTurnMessage,
					)
				: await command();
		} catch (error) {
			rejection = { error };
		} finally {
			const activeIndex = this.activeTurnCommands.indexOf(activeTurn);
			if (activeIndex >= 0) this.activeTurnCommands.splice(activeIndex, 1);
			for (const deliver of activeTurn.terminalDeliveries) deliver();
		}
		if (activeTurn.terminalDeliveries.length > 0) return;
		if (rejection) throw rejection.error;
		const failedMessage = readFailedTurnMessage(result);
		if (failedMessage) throw new Error(failedMessage);
	}
}

function readFailedTurnMessage(value: unknown): string | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const error = Reflect.get(value, "error");
	return Reflect.get(value, "status") === "failed" &&
		typeof error === "object" &&
		error !== null &&
		typeof Reflect.get(error, "message") === "string"
		? Reflect.get(error, "message")
		: undefined;
}

function isAgentEndFrame(event: unknown): boolean {
	return typeof event === "object" && event !== null && Reflect.get(event, "type") === "agent_end";
}

function readResourceCommands(
	resourceLoader: GreenfieldResourceLoader,
): ReturnType<GreenfieldCommandDiscoveryCapability["readCommands"]> {
	const prompts = resourceLoader.getPrompts().prompts.map((template) => ({
		name: template.name,
		description: template.description,
		source: "prompt" as const,
		location: normalizeLocation(template.source),
		path: template.filePath,
	}));
	const skills = resourceLoader.getSkills().skills.map((skill) => ({
		name: `skill:${skill.name}`,
		description: skill.description,
		source: "skill" as const,
		location: normalizeLocation(skill.source),
		path: skill.filePath,
	}));
	return [...prompts, ...skills];
}

function normalizeLocation(source: string): "user" | "project" | "path" | undefined {
	return source === "user" || source === "project" || source === "path" ? source : undefined;
}

function readForkMessages(session: GreenfieldRuntimeSession): readonly { entryId: string; text: string }[] {
	return session
		.readHistory()
		.filter(
			(entry): entry is Extract<HistoryEntry, { type: "message" }> =>
				entry.type === "message" && entry.message.role === "user" && entry.entryId !== undefined,
		)
		.map((entry) => ({ entryId: entry.entryId ?? "", text: readMessageText(entry.message) }))
		.filter(({ text }) => text.length > 0);
}

function readLastAssistantText(session: GreenfieldRuntimeSession): string | undefined {
	const message = [...session.readMessages()].reverse().find((candidate) => candidate.role === "assistant");
	return message ? readMessageText(message) || undefined : undefined;
}

function readMessageText(message: { readonly content: unknown }): string {
	if (typeof message.content === "string") return message.content;
	if (!Array.isArray(message.content)) return "";
	return message.content
		.map((part) =>
			typeof part === "object" && part !== null && "text" in part && typeof part.text === "string" ? part.text : "",
		)
		.join("");
}
