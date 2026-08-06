import type { GreenfieldRuntimeSession } from "@vetta/runtime-core";
import {
	CodingAgentGreenfieldTurnExecutor,
	type CodingAgentGreenfieldTurnPromptOptions,
} from "../../adapters/runtime-core/greenfield-turn-executor.js";
import {
	CodingAgentGreenfieldTurnRetryController,
	type CodingAgentGreenfieldTurnRetryEvent,
	type CodingAgentGreenfieldTurnRetrySettings,
} from "../../adapters/runtime-core/greenfield-turn-retry-controller.js";

export type CodingAgentTurnRetryEvent = CodingAgentGreenfieldTurnRetryEvent;
export type CodingAgentTurnRetrySettings = CodingAgentGreenfieldTurnRetrySettings;
export type CodingAgentTurnPromptOptions = CodingAgentGreenfieldTurnPromptOptions;

export interface CodingAgentTurnSessionHost {
	startActiveSessionOperation<T>(operation: (session: GreenfieldRuntimeSession) => Promise<T>): Promise<T>;
}

export interface CodingAgentTurnCommandHost {
	throwIfExtensionCommand(text: string): void;
	tryExecute(text: string): Promise<boolean>;
}

export interface CodingAgentTurnRetryController {
	readonly retryAttempt: number;
	readonly isRetrying: boolean;
	setAutoRetryEnabled(enabled: boolean): void;
	abortRetry(): void;
	run<T>(
		executeInitial: () => Promise<T>,
		executeRetry: () => Promise<T>,
		readFailure: (result: T) => string | undefined,
	): Promise<T>;
}

export interface CodingAgentTurnExecutor {
	prompt(message: string, options?: CodingAgentTurnPromptOptions): Promise<void>;
}

export interface CreateCodingAgentTurnRetryControllerOptions {
	readonly readSettings: () => CodingAgentTurnRetrySettings;
	readonly setEnabled: (enabled: boolean) => void;
	readonly emit: (event: CodingAgentTurnRetryEvent) => void;
}

export interface CreateCodingAgentTurnExecutorOptions {
	readonly sessionHost: CodingAgentTurnSessionHost;
	readonly retryController: CodingAgentTurnRetryController;
	readonly commandHost?: CodingAgentTurnCommandHost;
}

export function createCodingAgentTurnRetryController(
	options: CreateCodingAgentTurnRetryControllerOptions,
): CodingAgentTurnRetryController {
	return new CodingAgentGreenfieldTurnRetryController(options);
}

export function createCodingAgentTurnExecutor(options: CreateCodingAgentTurnExecutorOptions): CodingAgentTurnExecutor {
	return new CodingAgentGreenfieldTurnExecutor(options);
}
