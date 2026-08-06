import type { RuntimeSessionExecutionObservation } from "@vetta/runtime-core";
import {
	type CodingAgentGreenfieldExtensionCommandActionPorts,
	createCodingAgentGreenfieldExtensionCommandActions,
} from "../../adapters/runtime-core/greenfield-extension-command-actions-adapter.js";
import { CodingAgentGreenfieldExtensionCommandHost } from "../../adapters/runtime-core/greenfield-extension-command-host.js";
import {
	CodingAgentGreenfieldExtensionEventHost,
	type CodingAgentGreenfieldExtensionEventHostOptions,
	type CodingAgentGreenfieldExtensionInitialization,
} from "../../adapters/runtime-core/greenfield-extension-event-host.js";
import {
	CodingAgentGreenfieldExtensionObservationAdapter,
	type CodingAgentGreenfieldObservedExtensionEvent,
} from "../../adapters/runtime-core/greenfield-extension-observation-adapter.js";
import type { ExtensionCommandContextActions, ExtensionRunner, SlashCommandInfo } from "../../extensions/index.js";

export type CodingAgentRuntimeExtensionInitialization = CodingAgentGreenfieldExtensionInitialization;
export type CodingAgentRuntimeExtensionEventHostOptions = CodingAgentGreenfieldExtensionEventHostOptions;
export type CodingAgentRuntimeExtensionCommandActionPorts = CodingAgentGreenfieldExtensionCommandActionPorts;
export type CodingAgentRuntimeObservedExtensionEvent = CodingAgentGreenfieldObservedExtensionEvent;
export type CodingAgentRuntimeExtensionCommandContextActions = ExtensionCommandContextActions;

export interface CodingAgentRuntimeExtensionCommandHost {
	readCommands(): readonly SlashCommandInfo[];
	tryExecute(text: string): Promise<boolean>;
	throwIfExtensionCommand(text: string): void;
}

export interface CodingAgentRuntimeExtensionCommandHostOptions {
	readonly runner: ExtensionRunner;
	readonly actions: CodingAgentRuntimeExtensionCommandContextActions;
}

export interface CodingAgentRuntimeExtensionEventHost {
	readonly runner: ExtensionRunner;
	initialize(
		input?: CodingAgentRuntimeExtensionInitialization,
		lifecycle?: { readonly emitSessionStart?: boolean },
	): Promise<void>;
	shutdown(): Promise<void>;
	discoverResources(reason: "startup" | "reload"): Promise<void>;
	readSystemPrompt(): string;
	rebindRuntimeActions(): void;
	rebindRuntimeBindings(): void;
	dispose(lifecycle?: { readonly emitSessionShutdown?: boolean }): Promise<void>;
}

export interface CodingAgentRuntimeExtensionObservationAdapter {
	observe(observation: RuntimeSessionExecutionObservation): Promise<void>;
}

export function createCodingAgentRuntimeExtensionCommandHost(
	options: CodingAgentRuntimeExtensionCommandHostOptions,
): CodingAgentRuntimeExtensionCommandHost {
	return new CodingAgentGreenfieldExtensionCommandHost(options);
}

export function createCodingAgentRuntimeExtensionEventHost(
	options: CodingAgentRuntimeExtensionEventHostOptions,
): CodingAgentRuntimeExtensionEventHost {
	return new CodingAgentGreenfieldExtensionEventHost(options);
}

export function createCodingAgentRuntimeExtensionObservationAdapter(
	emit: (event: CodingAgentRuntimeObservedExtensionEvent) => Promise<void>,
): CodingAgentRuntimeExtensionObservationAdapter {
	return new CodingAgentGreenfieldExtensionObservationAdapter(emit);
}

export function createCodingAgentRuntimeExtensionCommandActions(
	ports: CodingAgentRuntimeExtensionCommandActionPorts,
): CodingAgentRuntimeExtensionCommandContextActions {
	return createCodingAgentGreenfieldExtensionCommandActions(ports);
}
