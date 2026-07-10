import { z } from "zod";
import { operationApprovalUiSchema, validateActionInput } from "../shared.js";
import type { JsonValue } from "../types.js";

const modelKeySchema = z
	.string()
	.trim()
	.min(1)
	.regex(/^[^/]+\/.+$/, 'model key must be "provider/modelId"');

export const modelsQueryInputSchema = z.discriminatedUnion("operation", [
	z.object({ operation: z.literal("help") }),
	z.object({ operation: z.literal("list") }),
	z.object({ operation: z.literal("get"), provider: z.string().trim().min(1).optional() }),
	z.object({
		operation: z.literal("probe"),
		provider: z.string().trim().min(1),
		model: z.string().trim().min(1),
	}),
]);

export const modelsManageInputSchema = z.discriminatedUnion("operation", [
	z.object({
		operation: z.literal("set-default"),
		modelKey: modelKeySchema,
		approvalUi: operationApprovalUiSchema("models.set-default"),
	}),
	z.object({
		operation: z.literal("upsert-provider"),
		provider: z.string().trim().min(1),
		data: z
			.object({
				baseUrl: z.string().trim().min(1).optional(),
				apiKey: z.string().optional(),
				api: z.string().trim().min(1).optional(),
				displayName: z.string().trim().min(1).optional(),
				authHeader: z.boolean().optional(),
				headers: z.record(z.string(), z.string()).optional(),
				models: z
					.array(
						z.object({
							id: z.string().trim().min(1),
							name: z.string().optional(),
							api: z.string().optional(),
							reasoning: z.boolean().optional(),
							contextWindow: z.number().int().positive().optional(),
							maxTokens: z.number().int().positive().optional(),
						}),
					)
					.optional(),
			})
			.refine((data) => Object.keys(data).length > 0, "upsert-provider requires at least one field."),
		approvalUi: operationApprovalUiSchema("models.upsert-provider"),
	}),
	z.object({
		operation: z.literal("remove-provider"),
		provider: z.string().trim().min(1),
		approvalUi: operationApprovalUiSchema("models.remove-provider"),
	}),
]);

export type ModelsQueryInput = z.infer<typeof modelsQueryInputSchema>;
export type ModelsManageInput = z.infer<typeof modelsManageInputSchema>;

export function validateModelsQueryInput(input: unknown): JsonValue {
	return validateActionInput(modelsQueryInputSchema, input, "models.query");
}

export function validateModelsManageInput(input: unknown): JsonValue {
	return validateActionInput(modelsManageInputSchema, input, "models.manage");
}
