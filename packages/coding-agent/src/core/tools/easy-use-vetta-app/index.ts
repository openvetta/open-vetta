import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import { loadToolDescription } from "../description.js";

export type EasyUseVettaAppJsonPrimitive = string | number | boolean | null;
export type EasyUseVettaAppJsonValue =
	| EasyUseVettaAppJsonPrimitive
	| EasyUseVettaAppJsonValue[]
	| { [key: string]: EasyUseVettaAppJsonValue };

const jsonSchema = Type.Unsafe<EasyUseVettaAppJsonValue>({
	description: "Any JSON-serializable value. The desktop host validates and interprets the concrete shape.",
});

const fieldSchema = Type.Object({
	id: Type.String({
		description: "Stable field id. Use it as the key in output values when the UI collects data.",
	}),
	label: Type.String({
		description: "Short user-facing field label.",
	}),
	description: Type.Optional(
		Type.String({
			description: "Short explanation of what the field controls or why it is needed.",
		}),
	),
	type: Type.Union(
		[
			Type.Literal("text"),
			Type.Literal("textarea"),
			Type.Literal("select"),
			Type.Literal("multiselect"),
			Type.Literal("toggle"),
			Type.Literal("number"),
			Type.Literal("json"),
			Type.Literal("custom"),
		],
		{
			description:
				"Generic field type. Hosts may map these to action-specific components or fall back to a simple form.",
		},
	),
	required: Type.Optional(Type.Boolean({ description: "Whether the UI should require a value before submitting." })),
	options: Type.Optional(
		Type.Array(
			Type.Object({
				label: Type.String(),
				value: jsonSchema,
				description: Type.Optional(Type.String()),
			}),
			{
				description: "Options for select-like fields.",
			},
		),
	),
	defaultValue: Type.Optional(jsonSchema),
});

export const easyUseVettaAppSchema = Type.Object({
	actionId: Type.String({
		description:
			'The Vetta Desktop action id this request is about, for example "appearance.theme" or "navigation.open".',
	}),
	intent: Type.String({
		description: "Concise explanation of what you want to do for the user and why.",
	}),
	proposedInput: Type.Optional(jsonSchema),
	ui: Type.Object({
		kind: Type.Union(
			[
				Type.Literal("confirm"),
				Type.Literal("form"),
				Type.Literal("select"),
				Type.Literal("preview"),
				Type.Literal("custom"),
			],
			{
				description:
					"Suggested UI shape. confirm is only one option; use form/select/preview/custom when the action needs richer interaction.",
			},
		),
		title: Type.String({ description: "Short title for the user-facing UI." }),
		description: Type.String({ description: "User-facing description of the proposed action or choice." }),
		component: Type.Optional(
			Type.String({
				description:
					"Optional stable component hint supplied by action help or description, e.g. appearance.theme.mode-picker.",
			}),
		),
		primaryLabel: Type.Optional(Type.String({ description: "Primary submit button label." })),
		cancelLabel: Type.Optional(Type.String({ description: "Cancel/decline button label." })),
	}),
	fields: Type.Optional(
		Type.Array(fieldSchema, {
			description:
				"Optional generic field definitions for form/select/custom UI. Keep this small and action-specific.",
		}),
	),
	metadata: Type.Optional(jsonSchema),
});

export interface EasyUseVettaAppFieldOption {
	label: string;
	value: EasyUseVettaAppJsonValue;
	description?: string;
}

export interface EasyUseVettaAppField {
	id: string;
	label: string;
	description?: string;
	type: "text" | "textarea" | "select" | "multiselect" | "toggle" | "number" | "json" | "custom";
	required?: boolean;
	options?: EasyUseVettaAppFieldOption[];
	defaultValue?: EasyUseVettaAppJsonValue;
}

export interface EasyUseVettaAppUi {
	kind: "confirm" | "form" | "select" | "preview" | "custom";
	title: string;
	description: string;
	component?: string;
	primaryLabel?: string;
	cancelLabel?: string;
}

export interface EasyUseVettaAppToolInput {
	actionId: string;
	intent: string;
	proposedInput?: EasyUseVettaAppJsonValue;
	ui: EasyUseVettaAppUi;
	fields?: EasyUseVettaAppField[];
	metadata?: EasyUseVettaAppJsonValue;
}

export interface EasyUseVettaAppAllowedAction {
	actionId: string;
	input?: EasyUseVettaAppJsonValue;
}

export interface EasyUseVettaAppResult {
	status: "approved" | "rejected" | "submitted" | "cancelled";
	message?: string;
	output?: EasyUseVettaAppJsonValue;
	allowedActions?: EasyUseVettaAppAllowedAction[];
}

export type EasyUseVettaAppRequestFn = (
	request: EasyUseVettaAppToolInput,
	signal?: AbortSignal,
) => Promise<EasyUseVettaAppResult>;

export interface EasyUseVettaAppCapability {
	isEnabled(): boolean;
	request: EasyUseVettaAppRequestFn;
}

export interface EasyUseVettaAppToolDetails extends EasyUseVettaAppResult {
	request: EasyUseVettaAppToolInput;
}

export interface EasyUseVettaAppToolOptions {
	request: EasyUseVettaAppRequestFn;
}

const FALLBACK_DESCRIPTION = [
	"Request Vetta Desktop UI assistance before using app-control actions.",
	"Use it to show action-specific UI, collect user input, preview a proposed app change, or get user approval before calling Vetta app actions.",
	"It returns a structured result; approval/rejection is only one possible UI outcome.",
	"After it returns, follow status/output/allowedActions and do not call an app action that the returned result does not allow.",
].join(" ");

function stringify(value: unknown): string {
	if (value === undefined) return "";
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function formatResultText(result: EasyUseVettaAppResult): string {
	const parts = [`Vetta Desktop UI returned status: ${result.status}.`];
	if (result.message) parts.push(result.message);
	if (result.output !== undefined) parts.push(`Output: ${stringify(result.output)}.`);
	if (result.allowedActions && result.allowedActions.length > 0) {
		parts.push(`Allowed actions: ${stringify(result.allowedActions)}.`);
	}
	return parts.join(" ");
}

export function createEasyUseVettaAppTool(
	options: EasyUseVettaAppToolOptions,
): AgentTool<typeof easyUseVettaAppSchema, EasyUseVettaAppToolDetails> {
	const description = loadToolDescription(import.meta.url, FALLBACK_DESCRIPTION);
	return {
		name: "easy_use_vettaApp",
		label: "Vetta App UI",
		description,
		parameters: easyUseVettaAppSchema,
		execute: async (_toolCallId: string, params: EasyUseVettaAppToolInput, signal?: AbortSignal) => {
			const request: EasyUseVettaAppToolInput = {
				actionId: params.actionId,
				intent: params.intent,
				proposedInput: params.proposedInput,
				ui: params.ui,
				fields: params.fields,
				metadata: params.metadata,
			};
			const result = await options.request(request, signal);
			return {
				content: [{ type: "text", text: formatResultText(result) }],
				details: { ...result, request },
			};
		},
	};
}
