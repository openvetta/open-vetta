import { z } from "zod";
import { operationApprovalUiSchema, validateActionInput } from "../shared.js";
import type { JsonValue } from "../types.js";

export const webhookQueryInputSchema = z.discriminatedUnion("operation", [
	z.object({ operation: z.literal("help") }),
	z.object({ operation: z.literal("list") }),
	z.object({ operation: z.literal("list-providers") }),
]);

export const webhookManageInputSchema = z.discriminatedUnion("operation", [
	z.object({
		operation: z.literal("create"),
		kind: z.enum(["feishu", "dingtalk"]),
		name: z.string().trim().min(1).optional(),
		webhookUrl: z.string().trim().min(1),
		signSecret: z.string().optional(),
		enabled: z.boolean().optional(),
		approvalUi: operationApprovalUiSchema("webhook.create"),
	}),
	z.object({
		operation: z.literal("update"),
		id: z.string().trim().min(1),
		data: z
			.object({
				name: z.string().trim().min(1).optional(),
				enabled: z.boolean().optional(),
				webhookUrl: z.string().trim().min(1).optional(),
				signSecret: z.string().optional(),
			})
			.refine((data) => Object.keys(data).length > 0, "update requires at least one field."),
		approvalUi: operationApprovalUiSchema("webhook.update"),
	}),
	z.object({
		operation: z.literal("set-enabled"),
		id: z.string().trim().min(1),
		enabled: z.boolean(),
		approvalUi: operationApprovalUiSchema("webhook.set-enabled"),
	}),
	z.object({
		operation: z.literal("delete"),
		id: z.string().trim().min(1),
		approvalUi: operationApprovalUiSchema("webhook.delete"),
	}),
	z.object({
		operation: z.literal("test"),
		id: z.string().trim().min(1),
		approvalUi: operationApprovalUiSchema("webhook.test"),
	}),
	z.object({
		operation: z.literal("send"),
		id: z.string().trim().min(1),
		text: z.string().trim().min(1),
		title: z.string().optional(),
		level: z.enum(["info", "warn", "error", "success"]).optional(),
		approvalUi: operationApprovalUiSchema("webhook.send"),
	}),
]);

export type WebhookQueryInput = z.infer<typeof webhookQueryInputSchema>;
export type WebhookManageInput = z.infer<typeof webhookManageInputSchema>;

export function validateWebhookQueryInput(input: unknown): JsonValue {
	return validateActionInput(webhookQueryInputSchema, input, "webhook.query");
}

export function validateWebhookManageInput(input: unknown): JsonValue {
	return validateActionInput(webhookManageInputSchema, input, "webhook.manage");
}
