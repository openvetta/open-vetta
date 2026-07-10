import { z } from "zod";
import { genericApprovalUiSchema, validateActionInput } from "../shared.js";
import type { JsonValue } from "../types.js";

export const imQueryInputSchema = z.discriminatedUnion("operation", [
	z.object({ operation: z.literal("help") }),
	z.object({ operation: z.literal("status") }),
	z.object({ operation: z.literal("logs"), limit: z.number().int().min(1).max(200).optional() }),
]);

export const imManageInputSchema = z.discriminatedUnion("operation", [
	z.object({
		operation: z.literal("set-enabled"),
		enabled: z.boolean(),
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("restart"),
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("set-agent-model"),
		modelKey: z
			.string()
			.trim()
			.min(1)
			.regex(/^[^/]+\/.+$/, 'modelKey must be "provider/modelId"')
			.nullable(),
		reasoningLevel: z.string().trim().min(1).optional(),
		approvalUi: genericApprovalUiSchema,
	}),
]);

export type ImQueryInput = z.infer<typeof imQueryInputSchema>;
export type ImManageInput = z.infer<typeof imManageInputSchema>;

export function validateImQueryInput(input: unknown): JsonValue {
	return validateActionInput(imQueryInputSchema, input, "im.query");
}

export function validateImManageInput(input: unknown): JsonValue {
	return validateActionInput(imManageInputSchema, input, "im.manage");
}
