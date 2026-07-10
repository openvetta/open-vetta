import { z } from "zod";
import { operationApprovalUiSchema, validateActionInput } from "../shared.js";
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
		approvalUi: operationApprovalUiSchema("plugins.set-enabled"),
	}),
	z.object({
		operation: z.literal("install-from-url"),
		url: z.string().url(),
		approvalUi: operationApprovalUiSchema("plugins.install-from-url"),
	}),
	z.object({
		operation: z.literal("uninstall"),
		id: z.string().trim().min(1),
		approvalUi: operationApprovalUiSchema("plugins.uninstall"),
	}),
	z.object({
		operation: z.literal("reload"),
		id: z.string().trim().min(1),
		approvalUi: operationApprovalUiSchema("plugins.reload"),
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
