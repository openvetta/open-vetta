import type { Extension, ExtensionRunner, RegisteredTool } from "../extensions/index.js";

export type CodingAgentGreenfieldExtensionRunnerPort = Pick<
	ExtensionRunner,
	| "createContext"
	| "emit"
	| "emitBeforeAgentStart"
	| "emitContext"
	| "emitInput"
	| "emitToolCall"
	| "emitToolResult"
	| "hasHandlers"
>;

export type CodingAgentGreenfieldExtensionToolSource = Pick<Extension, "tools">;
export type CodingAgentGreenfieldSessionToolRegistration = RegisteredTool;

export interface CodingAgentGreenfieldExtensionEventBinding {
	readSystemPrompt(): string;
	dispose(): void;
}
