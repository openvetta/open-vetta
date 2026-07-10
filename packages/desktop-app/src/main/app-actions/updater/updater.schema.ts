import { z } from "zod";
import { genericApprovalUiSchema, validateActionInput } from "../shared.js";
import type { JsonValue } from "../types.js";

export const updaterQueryInputSchema = z.discriminatedUnion("operation", [
	z.object({ operation: z.literal("help") }),
	z.object({ operation: z.literal("state") }),
	z.object({ operation: z.literal("version") }),
]);

export const updaterManageInputSchema = z.discriminatedUnion("operation", [
	z.object({
		operation: z.literal("check"),
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("download"),
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("install"),
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("dismiss"),
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("cancel"),
		approvalUi: genericApprovalUiSchema,
	}),
]);

export type UpdaterQueryInput = z.infer<typeof updaterQueryInputSchema>;
export type UpdaterManageInput = z.infer<typeof updaterManageInputSchema>;

export function validateUpdaterQueryInput(input: unknown): JsonValue {
	return validateActionInput(updaterQueryInputSchema, input, "updater.query");
}

export function validateUpdaterManageInput(input: unknown): JsonValue {
	return validateActionInput(updaterManageInputSchema, input, "updater.manage");
}
