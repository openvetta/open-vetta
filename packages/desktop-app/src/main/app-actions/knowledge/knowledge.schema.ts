import { z } from "zod";
import { genericApprovalUiSchema, validateActionInput } from "../shared.js";
import type { JsonValue } from "../types.js";

export const knowledgeQueryInputSchema = z.discriminatedUnion("operation", [
	z.object({ operation: z.literal("help") }),
	z.object({ operation: z.literal("list") }),
	z.object({ operation: z.literal("statuses") }),
	z.object({ operation: z.literal("is-processing") }),
]);

export const knowledgeManageInputSchema = z.discriminatedUnion("operation", [
	z.object({
		operation: z.literal("create"),
		name: z.string().trim().min(1),
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("rename"),
		name: z.string().trim().min(1),
		newName: z.string().trim().min(1),
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("delete"),
		name: z.string().trim().min(1),
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("add-files"),
		kbId: z.string().trim().min(1),
		paths: z.array(z.string().trim().min(1)).min(1),
		move: z.boolean().optional().default(false),
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("delete-entry"),
		kbId: z.string().trim().min(1),
		relPath: z.string().trim().min(1),
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("scan-now"),
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("retry-failed"),
		approvalUi: genericApprovalUiSchema,
	}),
]);

export type KnowledgeQueryInput = z.infer<typeof knowledgeQueryInputSchema>;
export type KnowledgeManageInput = z.infer<typeof knowledgeManageInputSchema>;

export function validateKnowledgeQueryInput(input: unknown): JsonValue {
	return validateActionInput(knowledgeQueryInputSchema, input, "knowledge.query");
}

export function validateKnowledgeManageInput(input: unknown): JsonValue {
	return validateActionInput(knowledgeManageInputSchema, input, "knowledge.manage");
}
