import { z } from "zod";
import { operationApprovalUiSchema, validateActionInput } from "../shared.js";
import type { JsonValue } from "../types.js";

/** 设置 → 通用：工作区 / 通知 / 默认执行模式。 */
export const generalQueryInputSchema = z.discriminatedUnion("operation", [
	z.object({ operation: z.literal("help") }),
	z.object({ operation: z.literal("get") }),
]);

export const generalManageInputSchema = z.discriminatedUnion("operation", [
	z.object({
		operation: z.literal("set-notifications"),
		enabled: z.boolean(),
		approvalUi: operationApprovalUiSchema("general.set-notifications"),
	}),
	z.object({
		operation: z.literal("set-execution-mode"),
		mode: z.enum(["sandbox", "full-access"]),
		approvalUi: operationApprovalUiSchema("general.set-execution-mode"),
	}),
	z.object({
		operation: z.literal("set-workspace"),
		path: z.string().trim().min(1),
		approvalUi: operationApprovalUiSchema("general.set-workspace"),
	}),
]);

export type GeneralQueryInput = z.infer<typeof generalQueryInputSchema>;
export type GeneralManageInput = z.infer<typeof generalManageInputSchema>;

export function validateGeneralQueryInput(input: unknown): JsonValue {
	return validateActionInput(generalQueryInputSchema, input, "general.query");
}

export function validateGeneralManageInput(input: unknown): JsonValue {
	return validateActionInput(generalManageInputSchema, input, "general.manage");
}
