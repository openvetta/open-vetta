import {
	type CodingAgentGreenfieldExtensionInitialization,
	CodingAgentGreenfieldTurnExecutor,
	CodingAgentGreenfieldTurnRetryController,
	type CodingAgentGreenfieldTurnRetryEvent,
	type CodingAgentGreenfieldTurnRetrySettings,
} from "@vetta/coding-agent/runtime-host/greenfield";
import {
	type GreenfieldRuntimeSession,
	RetryableCleanup,
	type RuntimeSessionExecutionObservation,
	type SessionEvent,
} from "@vetta/runtime-core";
import type { ManagedMcpRuntimeToolSource } from "@vetta/runtime-mcp";
import type {
	CodingAgentGreenfieldActiveSessionHost,
	GreenfieldRuntimeComposition,
} from "../greenfield-runtime-composition.js";
import type { GreenfieldExtensionSessionHost } from "./greenfield-extension-session-host.js";

export interface GreenfieldAgentSessionHostOptions {
	readonly runtime: GreenfieldRuntimeComposition;
	readonly activeSessionHost: CodingAgentGreenfieldActiveSessionHost;
	readonly extensionSessionHost: GreenfieldExtensionSessionHost;
	readonly mcpSource: ManagedMcpRuntimeToolSource;
	readonly readRetrySettings: () => CodingAgentGreenfieldTurnRetrySettings;
	readonly setRetryEnabled: (enabled: boolean) => void;
}

/** Runtime、活动 Session、Extension、MCP、Turn 与最终清理的中立进程宿主。 */
export class GreenfieldAgentSessionHost {
	readonly runtime: GreenfieldRuntimeComposition;
	readonly retryController: CodingAgentGreenfieldTurnRetryController;
	readonly turnExecutor: CodingAgentGreenfieldTurnExecutor;
	private readonly retryListeners = new Set<(event: CodingAgentGreenfieldTurnRetryEvent) => void>();
	private readonly cleanup = new RetryableCleanup();

	constructor(private readonly options: GreenfieldAgentSessionHostOptions) {
		this.runtime = options.runtime;
		this.retryController = new CodingAgentGreenfieldTurnRetryController({
			readSettings: options.readRetrySettings,
			setEnabled: options.setRetryEnabled,
			emit: (event) => {
				for (const listener of this.retryListeners) listener(event);
			},
		});
		this.turnExecutor = new CodingAgentGreenfieldTurnExecutor({
			sessionHost: options.activeSessionHost,
			retryController: this.retryController,
			commandHost: options.extensionSessionHost,
		});
		this.cleanup.add({
			id: "retry-controller",
			phase: 0,
			cleanup: () => this.retryController.abortRetry(),
		});
		this.cleanup.add({
			id: "extension-session-host",
			phase: 0,
			cleanup: () => options.extensionSessionHost.dispose(),
		});
		this.cleanup.add({
			id: "active-session-host",
			phase: 1,
			cleanup: () => options.activeSessionHost.dispose(),
		});
		this.cleanup.add({ id: "runtime", phase: 2, cleanup: () => options.runtime.dispose() });
		this.cleanup.add({ id: "mcp-source", phase: 3, cleanup: () => options.mcpSource.dispose() });
	}

	readSession(): GreenfieldRuntimeSession {
		return this.options.activeSessionHost.readSession();
	}

	startActiveSessionOperation<T>(operation: (session: GreenfieldRuntimeSession) => Promise<T>): Promise<T> {
		return this.options.activeSessionHost.startActiveSessionOperation(operation);
	}

	subscribe(listener: (event: SessionEvent) => void): () => void {
		return this.options.activeSessionHost.subscribe(listener);
	}

	subscribeExecutionObservations(
		listener: (observation: RuntimeSessionExecutionObservation) => Promise<void> | void,
	): () => void {
		return this.options.activeSessionHost.subscribeExecutionObservations(listener);
	}

	subscribeRetryEvents(listener: (event: CodingAgentGreenfieldTurnRetryEvent) => void): () => void {
		this.retryListeners.add(listener);
		return () => this.retryListeners.delete(listener);
	}

	initializeExtensions(input: CodingAgentGreenfieldExtensionInitialization): Promise<void> {
		return this.options.extensionSessionHost.initialize(input);
	}

	shutdownExtensions(): Promise<void> {
		return this.options.extensionSessionHost.shutdown();
	}

	newSession(...args: Parameters<CodingAgentGreenfieldActiveSessionHost["newSession"]>) {
		return this.options.activeSessionHost.newSession(...args);
	}

	switchSession(...args: Parameters<CodingAgentGreenfieldActiveSessionHost["switchSession"]>) {
		return this.options.activeSessionHost.switchSession(...args);
	}

	fork(...args: Parameters<CodingAgentGreenfieldActiveSessionHost["fork"]>) {
		return this.options.activeSessionHost.fork(...args);
	}

	async dispose(): Promise<void> {
		this.retryListeners.clear();
		await this.cleanup.run("Failed to dispose Greenfield Agent Session Host");
	}
}
