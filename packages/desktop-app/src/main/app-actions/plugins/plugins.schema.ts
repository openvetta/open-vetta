import { z } from "zod";
import { genericApprovalUiSchema, validateActionInput } from "../shared.js";
import type { JsonValue } from "../types.js";

export const pluginsQueryInputSchema = z.discriminatedUnion("operation", [
	z.object({ operation: z.literal("help") }),
	z.object({ operation: z.literal("list") }),
	z.object({ operation: z.literal("get"), id: z.string().trim().min(1) }),
]);

export const pluginsManageInputSchema = z.discriminatedUnion("operation", [
	z.object({
		operation: z.literal("set-enabled"),
		id: z.string().trim().min(1),
		enabled: z.boolean(),
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("install-from-url"),
		url: z.string().url(),
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("uninstall"),
		id: z.string().trim().min(1),
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("reload"),
		id: z.string().trim().min(1),
		approvalUi: genericApprovalUiSchema,
	}),
]);

export type PluginsQueryInput = z.infer<typeof pluginsQueryInputSchema>;
export type PluginsManageInput = z.infer<typeof pluginsManageInputSchema>;

export function validatePluginsQueryInput(input: unknown): JsonValue {
	return validateActionInput(pluginsQueryInputSchema, input, "plugins.query");
}

export function validatePluginsManageInput(input: unknown): JsonValue {
	return validateActionInput(pluginsManageInputSchema, input, "plugins.manage");
}
