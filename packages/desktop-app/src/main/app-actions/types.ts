import type { ActionRpcErrorBody, JsonValue } from "@vetta/action-rpc";

export type { JsonValue } from "@vetta/action-rpc";

export type ActionAvailability = "headless" | "gui-main" | "gui-renderer";

export interface ActionExample {
	description: string;
	input: JsonValue;
}

export interface ActionInputSchema {
	description: string;
}

export interface ActionMetadata {
	id: string;
	domain: string;
	title: string;
	summary: string;
	availability: ActionAvailability;
	permission: string;
	inputSchema: ActionInputSchema;
	examples: ActionExample[];
}

export interface ActionSearchResult {
	id: string;
	domain: string;
	title: string;
	summary: string;
	availability: ActionAvailability;
}

export interface ActionContext {
	source: "internal" | "local-server";
}

export interface ActionDefinition extends ActionMetadata {
	validateInput: (input: unknown) => JsonValue;
	requiresApproval?: (input: JsonValue, context: ActionContext) => boolean;
	run: (input: JsonValue, context: ActionContext) => Promise<JsonValue> | JsonValue;
}

export type ActionErrorBody = ActionRpcErrorBody;

export class ActionError extends Error {
	code: string;
	details?: JsonValue;

	constructor(code: string, message: string, details?: JsonValue) {
		super(message);
		this.name = "ActionError";
		this.code = code;
		this.details = details;
	}
}
