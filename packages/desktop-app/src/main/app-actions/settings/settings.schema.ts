import { z } from "zod";
import { genericApprovalUiSchema, validateActionInput } from "../shared.js";
import type { JsonValue } from "../types.js";

export const settingsQueryInputSchema = z.discriminatedUnion("operation", [
	z.object({ operation: z.literal("help") }),
	z.object({ operation: z.literal("get") }),
]);

export const settingsManageInputSchema = z.discriminatedUnion("operation", [
	z.object({
		operation: z.literal("set-language"),
		language: z.enum(["zh", "en"]),
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("set-notifications"),
		enabled: z.boolean(),
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("set-execution-mode"),
		mode: z.enum(["sandbox", "full-access"]),
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("set-workspace"),
		path: z.string().trim().min(1),
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("set-experimental"),
		data: z
			.object({
				vettaCli: z.boolean().optional(),
				promptPrediction: z.boolean().optional(),
				agentSkills: z.boolean().optional(),
			})
			.refine((data) => Object.keys(data).length > 0, "set-experimental requires at least one field."),
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("set-knowledge-base"),
		data: z
			.object({
				enabled: z.boolean().optional(),
				pollIntervalMinutes: z.union([z.literal(3), z.literal(5), z.literal(10), z.literal(30)]).optional(),
				processingModelKey: z.string().trim().min(1).nullable().optional(),
				processingModelReasoningLevel: z.string().trim().min(1).nullable().optional(),
				agentConcurrency: z.number().int().min(1).max(16).optional(),
				ocrConcurrency: z.number().int().min(1).max(8).optional(),
			})
			.refine((data) => Object.keys(data).length > 0, "set-knowledge-base requires at least one field."),
		approvalUi: genericApprovalUiSchema,
	}),
]);

export type SettingsQueryInput = z.infer<typeof settingsQueryInputSchema>;
export type SettingsManageInput = z.infer<typeof settingsManageInputSchema>;

export function validateSettingsQueryInput(input: unknown): JsonValue {
	return validateActionInput(settingsQueryInputSchema, input, "settings.query");
}

export function validateSettingsManageInput(input: unknown): JsonValue {
	return validateActionInput(settingsManageInputSchema, input, "settings.manage");
}
