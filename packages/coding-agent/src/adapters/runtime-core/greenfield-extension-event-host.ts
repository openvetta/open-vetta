import type { GreenfieldRuntimeSession } from "@vetta/runtime-core";
import type { ExtensionExecutionHost } from "../../core/extensions/execution-host.js";
import { ExtensionRunner } from "../../core/extensions/runner.js";
import type { Extension, ExtensionError, ExtensionRuntime, ExtensionUIContext } from "../../core/extensions/types.js";
import type { ModelRegistry } from "../../core/model-registry.js";
import type { ResourceLoader } from "../../core/resource-loader.js";
import { CodingAgentGreenfieldExtensionActionHost } from "./greenfield-extension-action-host.js";
import { CodingAgentGreenfieldExtensionObservationAdapter } from "./greenfield-extension-observation-adapter.js";
import { createGreenfieldReadonlySessionManager } from "./greenfield-readonly-session-manager.js";

export interface CodingAgentGreenfieldExtensionEventBinding {
	readSystemPrompt(): string;
	dispose(): void;
}

export interface CodingAgentGreenfieldExtensionEventHostOptions {
	readonly extensions: readonly Extension[];
	readonly runtime: ExtensionRuntime;
	readonly cwd: string;
	readonly session: GreenfieldRuntimeSession;
	readonly modelRegistry: ModelRegistry;
	readonly resourceLoader: Pick<ResourceLoader, "getPrompts" | "getSkills">;
	readonly bindEvents: (
		runner: ExtensionRunner,
		options?: { readonly replaceExisting?: boolean },
	) => CodingAgentGreenfieldExtensionEventBinding;
	readonly onError?: (error: ExtensionError) => void;
}

/**
 * Greenfield Extension 的 Session 级组合宿主。
 *
 * Action、Context 与事件桥在这里一次性绑定到同一个 Runner；Runtime Core 只暴露
 * 会话端口，CLI 只负责 UI、shutdown 和错误监听生命周期。
 */
export class CodingAgentGreenfieldExtensionEventHost {
	readonly runner: ExtensionRunner;
	private readonly actionHost: CodingAgentGreenfieldExtensionActionHost;
	private eventBinding: CodingAgentGreenfieldExtensionEventBinding;
	private readonly removeExecutionObservationListener: () => void;
	private removeErrorListener: (() => void) | undefined;
	private shutdownHandler: () => void = () => {};
	private errorListener: ((error: ExtensionError) => void) | undefined;
	private initialized = false;
	private shutdownEmitted = false;
	private disposed = false;

	constructor(private readonly options: CodingAgentGreenfieldExtensionEventHostOptions) {
		const assembly = options.session.createCoreAssembly();
		const contextController = assembly.contextController;
		if (!contextController) throw new Error("Greenfield Extension events require a Runtime context controller");

		this.actionHost = new CodingAgentGreenfieldExtensionActionHost({
			session: options.session,
			resourceLoader: options.resourceLoader,
			onError: (error) => this.reportError(error),
		});
		this.runner = new ExtensionRunner(
			[...options.extensions],
			options.runtime,
			options.cwd,
			createGreenfieldReadonlySessionManager(assembly),
			options.modelRegistry,
		);
		this.eventBinding = options.bindEvents(this.runner);
		const observationAdapter = new CodingAgentGreenfieldExtensionObservationAdapter(async (event) => {
			await this.runner.emit(event);
		});
		this.removeExecutionObservationListener = assembly.executionObservationStream.subscribe(async (observation) => {
			try {
				await observationAdapter.observe(observation);
			} catch (error) {
				this.reportRuntimeError("execution_observation", error);
			}
		});
		const executionHost: ExtensionExecutionHost = {
			actions: this.actionHost.actions,
			contextActions: {
				getModel: () => options.session.readState().model,
				isIdle: () => !options.session.readState().isStreaming,
				abort: () => {
					void options.session.abort().catch((error: unknown) => {
						this.reportRuntimeError("abort", error);
					});
				},
				hasPendingMessages: () => assembly.queueView.readPendingMessageCount() > 0,
				shutdown: () => this.shutdownHandler(),
				getContextUsage: () => assembly.contextUsageView.readContextUsage(),
				compact: (compactOptions) => {
					void contextController.compact({ customInstructions: compactOptions?.customInstructions }).then(
						(result) => compactOptions?.onComplete?.(result),
						(error: unknown) =>
							compactOptions?.onError?.(error instanceof Error ? error : new Error(String(error))),
					);
				},
				getSystemPrompt: () => this.eventBinding.readSystemPrompt(),
			},
		};
		this.runner.bindExecutionHost(executionHost);
		this.removeErrorListener = this.runner.onError((error) => this.reportError(error));
	}

	async initialize(
		input: {
			readonly uiContext: ExtensionUIContext;
			readonly shutdownHandler: () => void;
			readonly onError: (error: ExtensionError) => void;
		},
		lifecycle: { readonly emitSessionStart?: boolean } = {},
	): Promise<void> {
		this.runner.setUIContext(input.uiContext);
		this.shutdownHandler = input.shutdownHandler;
		this.errorListener = input.onError;
		if (this.initialized) return;
		this.initialized = true;
		if (lifecycle.emitSessionStart !== false) await this.runner.emit({ type: "session_start" });
	}

	async shutdown(): Promise<void> {
		if (!this.initialized || this.shutdownEmitted) return;
		this.shutdownEmitted = true;
		await this.runner.emit({ type: "session_shutdown" });
	}

	rebindRuntimeActions(): void {
		if (this.disposed) throw new Error("Greenfield Extension event host is disposed");
		this.actionHost.bind(this.options.runtime);
	}

	rebindRuntimeBindings(): void {
		if (this.disposed) throw new Error("Greenfield Extension event host is disposed");
		this.actionHost.bind(this.options.runtime);
		this.eventBinding.dispose();
		this.eventBinding = this.options.bindEvents(this.runner, { replaceExisting: true });
	}

	async dispose(lifecycle: { readonly emitSessionShutdown?: boolean } = {}): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		if (lifecycle.emitSessionShutdown !== false) await this.shutdown();
		this.removeErrorListener?.();
		this.removeErrorListener = undefined;
		this.removeExecutionObservationListener();
		this.eventBinding.dispose();
		await this.actionHost.dispose();
	}

	private reportRuntimeError(event: string, error: unknown): void {
		this.reportError({
			extensionPath: "<runtime>",
			event,
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
	}

	private reportError(error: ExtensionError): void {
		this.errorListener?.(error);
		this.options.onError?.(error);
	}
}
