import { z } from "zod";
import { operationApprovalUiSchema, validateActionInput } from "../shared.js";
import type { JsonValue } from "../types.js";

export const updaterQueryInputSchema = z.discriminatedUnion("operation", [
	z.object({ operation: z.literal("help") }),
	z.object({ operation: z.literal("state") }),
	z.object({ operation: z.literal("version") }),
]);

export const updaterManageInputSchema = z.discriminatedUnion("operation", [
	z.object({
		operation: z.literal("check"),
		approvalUi: operationApprovalUiSchema("updater.check"),
	}),
	z.object({
		operation: z.literal("download"),
		approvalUi: operationApprovalUiSchema("updater.download"),
	}),
	z.object({
		operation: z.literal("install"),
		approvalUi: operationApprovalUiSchema("updater.install"),
	}),
	z.object({
		operation: z.literal("dismiss"),
		approvalUi: operationApprovalUiSchema("updater.dismiss"),
	}),
	z.object({
		operation: z.literal("cancel"),
		approvalUi: operationApprovalUiSchema("updater.cancel"),
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
