import { z } from "zod";
import { genericApprovalUiSchema, validateActionInput } from "../shared.js";
import type { JsonValue } from "../types.js";

const pathSchema = z.string().trim().min(1);

export const projectsQueryInputSchema = z.discriminatedUnion("operation", [
	z.object({ operation: z.literal("help") }),
	z.object({ operation: z.literal("list") }),
	z.object({ operation: z.literal("list-sessions"), cwd: pathSchema }),
	z.object({ operation: z.literal("list-runtime-projects") }),
]);

export const projectsManageInputSchema = z.discriminatedUnion("operation", [
	z.object({
		operation: z.literal("create"),
		name: z.string().trim().min(1),
		path: pathSchema.optional(),
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("open"),
		path: pathSchema,
		name: z.string().trim().min(1).optional(),
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("rename"),
		path: pathSchema,
		name: z.string().trim().min(1),
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("archive"),
		path: pathSchema,
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("unarchive"),
		path: pathSchema,
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("remove"),
		path: pathSchema,
		approvalUi: genericApprovalUiSchema,
	}),
]);

export type ProjectsQueryInput = z.infer<typeof projectsQueryInputSchema>;
export type ProjectsManageInput = z.infer<typeof projectsManageInputSchema>;

export function validateProjectsQueryInput(input: unknown): JsonValue {
	return validateActionInput(projectsQueryInputSchema, input, "projects.query");
}

export function validateProjectsManageInput(input: unknown): JsonValue {
	return validateActionInput(projectsManageInputSchema, input, "projects.manage");
}
