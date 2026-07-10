import { z } from "zod";
import { genericApprovalUiSchema, validateActionInput } from "../shared.js";
import type { JsonValue } from "../types.js";

export const downloadsQueryInputSchema = z.discriminatedUnion("operation", [
	z.object({ operation: z.literal("help") }),
	z.object({ operation: z.literal("list") }),
]);

export const downloadsManageInputSchema = z.discriminatedUnion("operation", [
	z.object({
		operation: z.literal("cancel"),
		id: z.string().trim().min(1),
		approvalUi: genericApprovalUiSchema,
	}),
]);

export type DownloadsQueryInput = z.infer<typeof downloadsQueryInputSchema>;
export type DownloadsManageInput = z.infer<typeof downloadsManageInputSchema>;

export function validateDownloadsQueryInput(input: unknown): JsonValue {
	return validateActionInput(downloadsQueryInputSchema, input, "downloads.query");
}

export function validateDownloadsManageInput(input: unknown): JsonValue {
	return validateActionInput(downloadsManageInputSchema, input, "downloads.manage");
}
