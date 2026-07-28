import {
	type CodingAgentTool,
	createImSendAttachmentTool,
	GREENFIELD_IM_RPC_PROFILE,
	type RpcSessionCapabilities,
	type RpcSessionInitialization,
	type RpcSessionState,
} from "@vetta/coding-agent";
import { adaptCodingAgentToolRegistration } from "@vetta/coding-agent/runtime-host/greenfield";
import type { GreenfieldRuntimeSession } from "@vetta/runtime-core";
import type { CodingToolRegistration } from "@vetta/runtime-tools/coding";
import type { GreenfieldRuntimeComposition } from "../greenfield-runtime-composition.js";
import { GreenfieldImRpcEventAdapter } from "./greenfield-im-rpc-events.js";

export interface GreenfieldImRpcSessionAdapterOptions {
	readonly session: GreenfieldRuntimeSession;
	readonly runtime: GreenfieldRuntimeComposition;
	readonly createHostToolRegistration?: (
		hostBridge: NonNullable<RpcSessionInitialization["hostBridge"]>,
	) => CodingToolRegistration;
}

/**
 * Greenfield Runtime 到 IM 所需 RPC Profile 的产品宿主适配器。
 *
 * 它刻意不实现 Retry、Bash、Export、Session Switch 等尚未迁移能力；
 * Dispatcher 会依据 greenfield-im Profile 对这些命令 fail closed。
 */
export class GreenfieldImRpcSessionAdapter implements RpcSessionCapabilities {
	readonly profile = GREENFIELD_IM_RPC_PROFILE;
	readonly turn;
	readonly state;
	readonly memory;

	private readonly greenfieldSession: GreenfieldRuntimeSession;
	private readonly runtime: GreenfieldRuntimeComposition;
	private readonly core;
	private readonly createHostToolRegistration: NonNullable<
		GreenfieldImRpcSessionAdapterOptions["createHostToolRegistration"]
	>;
	private unregisterHostTool: (() => void) | undefined;
	private disposed = false;

	constructor(options: GreenfieldImRpcSessionAdapterOptions) {
		if (options.runtime.scenario !== "im-claw") {
			throw new Error(
				`Greenfield IM RPC adapter requires runtime scenario im-claw, received ${options.runtime.scenario}`,
			);
		}
		this.greenfieldSession = options.session;
		this.runtime = options.runtime;
		this.core = this.greenfieldSession.createCoreAssembly();
		this.createHostToolRegistration =
			options.createHostToolRegistration ??
			((hostBridge) =>
				adaptCodingAgentToolRegistration(createImSendAttachmentTool(hostBridge) as unknown as CodingAgentTool));
		this.turn = {
			prompt: async (message, promptOptions) => {
				await this.greenfieldSession.prompt({
					text: message,
					images: promptOptions.images,
					streamingBehavior: promptOptions.streamingBehavior,
				});
			},
			steer: async (message, images) => {
				await this.greenfieldSession.prompt({ text: message, images, streamingBehavior: "steer" });
			},
			followUp: async (message, images) => {
				await this.greenfieldSession.prompt({ text: message, images, streamingBehavior: "followUp" });
			},
			abort: () => this.greenfieldSession.abort("RPC abort"),
		} satisfies NonNullable<RpcSessionCapabilities["turn"]>;
		this.state = {
			readState: () => this.readRpcState(),
			readMessages: () => this.core.corePorts.stateReader.readMessages(),
		} satisfies NonNullable<RpcSessionCapabilities["state"]>;
		this.memory = {
			flushMemory: () => this.runtime.flushMemory(this.greenfieldSession.sessionId),
		} satisfies NonNullable<RpcSessionCapabilities["memory"]>;
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
		return this.greenfieldSession.subscribe((event) => {
			for (const mapped of adapter.map(event)) listener(mapped);
		});
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
			await this.greenfieldSession.dispose();
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
		const [sessionState, state] = await Promise.all([
			this.greenfieldSession.getState(),
			Promise.resolve(this.core.corePorts.stateReader.readState()),
		]);
		const context = this.core.contextController?.readState();
		return {
			model: state.model,
			thinkingLevel: state.thinkingLevel,
			isStreaming: state.isStreaming,
			isCompacting: context?.isCompacting ?? false,
			steeringMode: sessionState.steeringMode,
			followUpMode: sessionState.followUpMode,
			sessionFile: this.core.lifecycle.sessionPath,
			sessionId: sessionState.sessionId,
			autoCompactionEnabled: context?.autoCompactionEnabled ?? false,
			messageCount: sessionState.messageCount,
			pendingMessageCount: sessionState.pendingMessageCount,
		};
	}
}
