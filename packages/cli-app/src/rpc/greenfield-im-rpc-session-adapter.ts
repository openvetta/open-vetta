import type { CodingAgentHostBootstrap } from "@vetta/coding-agent/bootstrap";
import type { CodingAgentTool } from "@vetta/coding-agent/profile";
import {
	createImSendAttachmentTool,
	GREENFIELD_IM_RPC_PROFILE,
	type RpcRuntimeDecision,
	type RpcSessionCapabilities,
	type RpcSessionInitialization,
	type RpcSessionState,
} from "@vetta/coding-agent/rpc";
import {
	adaptCodingAgentToolRegistration,
	type CodingAgentGreenfieldExtensionCommandHost,
} from "@vetta/coding-agent/runtime-host/greenfield";
import type { GreenfieldRuntimeSession, HistoryEntry } from "@vetta/runtime-core";
import type { CodingToolRegistration } from "@vetta/runtime-tools/coding";
import type {
	CodingAgentGreenfieldActiveSessionHost,
	GreenfieldRuntimeComposition,
} from "../greenfield-runtime-composition.js";
import { GreenfieldImRpcEventAdapter } from "./greenfield-im-rpc-events.js";

type GreenfieldImResourceLoader = Pick<CodingAgentHostBootstrap["resourceLoader"], "getPrompts" | "getSkills">;
type GreenfieldImCommandDiscoveryCapability = NonNullable<RpcSessionCapabilities["commands"]>;

export interface GreenfieldImRpcSessionAdapterOptions {
	readonly sessionHost: Pick<
		CodingAgentGreenfieldActiveSessionHost,
		"dispose" | "fork" | "newSession" | "readSession" | "subscribe" | "switchSession"
	>;
	readonly runtime: GreenfieldRuntimeComposition;
	readonly resourceLoader: GreenfieldImResourceLoader;
	readonly runtimeDecision?: RpcRuntimeDecision;
	readonly extensionCommandHost?: Pick<
		CodingAgentGreenfieldExtensionCommandHost,
		"readCommands" | "throwIfExtensionCommand" | "tryExecute"
	>;
	readonly createHostToolRegistration?: (
		hostBridge: NonNullable<RpcSessionInitialization["hostBridge"]>,
	) => CodingToolRegistration;
}

/**
 * Greenfield Runtime 到 IM 所需 RPC Profile 的产品宿主适配器。
 *
 * 它刻意不实现 Retry、Bash、Export 等尚未迁移能力；
 * Dispatcher 会依据 greenfield-im Profile 对这些命令 fail closed。
 */
export class GreenfieldImRpcSessionAdapter implements RpcSessionCapabilities {
	readonly profile = GREENFIELD_IM_RPC_PROFILE;
	readonly turn;
	readonly state;
	readonly memory;
	readonly session;
	readonly commands: GreenfieldImCommandDiscoveryCapability;

	private readonly sessionHost: GreenfieldImRpcSessionAdapterOptions["sessionHost"];
	private readonly runtime: GreenfieldRuntimeComposition;
	private readonly resourceLoader: GreenfieldImResourceLoader;
	private readonly runtimeDecision: RpcRuntimeDecision;
	private readonly extensionCommandHost: GreenfieldImRpcSessionAdapterOptions["extensionCommandHost"];
	private readonly createHostToolRegistration: NonNullable<
		GreenfieldImRpcSessionAdapterOptions["createHostToolRegistration"]
	>;
	private unregisterHostTool: (() => void) | undefined;
	private activeTurnCommands = 0;
	private readonly pendingAgentEndDeliveries: Array<() => void> = [];
	private disposed = false;

	constructor(options: GreenfieldImRpcSessionAdapterOptions) {
		if (options.runtime.scenario !== "im-claw") {
			throw new Error(
				`Greenfield IM RPC adapter requires runtime scenario im-claw, received ${options.runtime.scenario}`,
			);
		}
		this.sessionHost = options.sessionHost;
		this.runtime = options.runtime;
		this.resourceLoader = options.resourceLoader;
		this.runtimeDecision = options.runtimeDecision ?? {
			requestedBackend: "greenfield-im",
			effectiveBackend: "greenfield-im",
		};
		this.extensionCommandHost = options.extensionCommandHost;
		this.createHostToolRegistration =
			options.createHostToolRegistration ??
			((hostBridge) =>
				adaptCodingAgentToolRegistration(createImSendAttachmentTool(hostBridge) as unknown as CodingAgentTool));
		this.turn = {
			prompt: async (message, promptOptions) => {
				if (await this.extensionCommandHost?.tryExecute(message)) return;
				await this.runTurnCommand(() =>
					this.readSession().prompt({
						text: message,
						images: promptOptions.images,
						streamingBehavior: promptOptions.streamingBehavior,
					}),
				);
			},
			steer: async (message, images) => {
				this.extensionCommandHost?.throwIfExtensionCommand(message);
				await this.runTurnCommand(() =>
					this.readSession().prompt({ text: message, images, streamingBehavior: "steer" }),
				);
			},
			followUp: async (message, images) => {
				this.extensionCommandHost?.throwIfExtensionCommand(message);
				await this.runTurnCommand(() =>
					this.readSession().prompt({ text: message, images, streamingBehavior: "followUp" }),
				);
			},
			abort: () => this.readSession().abort("RPC abort"),
		} satisfies NonNullable<RpcSessionCapabilities["turn"]>;
		this.state = {
			readState: () => this.readRpcState(),
			readMessages: () => this.readCore().corePorts.stateReader.readMessages(),
		} satisfies NonNullable<RpcSessionCapabilities["state"]>;
		this.memory = {
			flushMemory: () => this.runtime.flushMemory(this.readSession().sessionId),
		} satisfies NonNullable<RpcSessionCapabilities["memory"]>;
		this.session = {
			newSession: async (parentSession) =>
				!(await this.sessionHost.newSession(parentSession ? { parentSession } : undefined)).cancelled,
			switchSession: async (sessionPath) => !(await this.sessionHost.switchSession(sessionPath)).cancelled,
			fork: (entryId) => this.sessionHost.fork(entryId),
			readForkMessages: () => readForkMessages(this.readSession()),
			readLastAssistantText: () => readLastAssistantText(this.readSession()),
			setName: () => unsupportedSessionOperation("set_session_name"),
			readStats: () => unsupportedSessionOperation("get_session_stats"),
			exportHtml: () => unsupportedSessionOperation("export_html"),
		} satisfies NonNullable<RpcSessionCapabilities["session"]>;
		this.commands = {
			readCommands: () => [
				...(this.extensionCommandHost?.readCommands() ?? []),
				...readResourceCommands(this.resourceLoader),
			],
		};
	}

	async initialize(input: RpcSessionInitialization): Promise<void> {
		if (this.unregisterHostTool) {
			throw new Error("Greenfield IM RPC session is already initialized");
		}
		if (!input.hostBridge) {
			throw new Error("Greenfield IM RPC profile requires a host bridge");
		}
		const registration = this.createHostToolRegistration(input.hostBridge);
		this.runtime.tools.registry.register(registration);
		this.unregisterHostTool = () => {
			this.runtime.tools.registry.unregister(registration.tool.name);
		};
	}

	subscribe(listener: (event: unknown) => void): () => void {
		const adapter = new GreenfieldImRpcEventAdapter();
		let subscribed = true;
		const unsubscribe = this.sessionHost.subscribe((event) => {
			for (const mapped of adapter.map(event)) {
				if (isAgentEndFrame(mapped) && this.activeTurnCommands > 0) {
					this.pendingAgentEndDeliveries.push(() => {
						if (subscribed) listener(mapped);
					});
					continue;
				}
				listener(mapped);
			}
		});
		return () => {
			subscribed = false;
			unsubscribe();
		};
	}

	async shutdown(): Promise<void> {
		// Greenfield 没有旧 Extension session_shutdown；协议关闭与资源释放由 dispose 分离处理。
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		this.unregisterHostTool?.();
		this.unregisterHostTool = undefined;
		const errors: unknown[] = [];
		try {
			await this.sessionHost.dispose();
		} catch (error) {
			errors.push(error);
		}
		try {
			await this.runtime.dispose();
		} catch (error) {
			errors.push(error);
		}
		if (errors.length > 0) {
			throw new AggregateError(errors, "Failed to dispose Greenfield IM RPC resources");
		}
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
			runtimeBackend: "greenfield-im",
			runtimeDecision: this.runtimeDecision,
			model: state.model,
			thinkingLevel: state.thinkingLevel,
			isStreaming: state.isStreaming,
			isCompacting: context?.isCompacting ?? false,
			steeringMode: sessionState.steeringMode,
			followUpMode: sessionState.followUpMode,
			sessionFile: core.lifecycle.sessionPath,
			sessionId: sessionState.sessionId,
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

	private async runTurnCommand(command: () => Promise<unknown>): Promise<void> {
		this.activeTurnCommands += 1;
		try {
			await command();
		} finally {
			this.activeTurnCommands -= 1;
			if (this.activeTurnCommands === 0) {
				for (const deliver of this.pendingAgentEndDeliveries.splice(0)) deliver();
			}
		}
	}
}

function isAgentEndFrame(event: unknown): boolean {
	return typeof event === "object" && event !== null && Reflect.get(event, "type") === "agent_end";
}

function readResourceCommands(
	resourceLoader: GreenfieldImResourceLoader,
): ReturnType<GreenfieldImCommandDiscoveryCapability["readCommands"]> {
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
	return message ? readMessageText(message) : undefined;
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

function unsupportedSessionOperation(operation: string): never {
	throw new Error(`Greenfield IM RPC operation ${operation} is not enabled by this profile`);
}
