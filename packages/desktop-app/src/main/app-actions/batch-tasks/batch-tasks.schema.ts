import { z } from "zod";
import { ActionError, type JsonValue } from "../types.js";

const projectApprovalUiSchema = z.enum(["generic", "batch-tasks.project"]).optional();
const taskApprovalUiSchema = z.enum(["generic", "batch-tasks.task"]).optional();
const executionApprovalUiSchema = z.enum(["generic", "batch-tasks.execution"]).optional();
const projectIdSchema = z.string().trim().min(1);
const taskIdSchema = z.string().trim().min(1);
const executionModeSchema = z.enum(["inherit", "sandbox", "full-access"]);
const skillSchema = z.object({
	name: z.string().trim().min(1),
	alias: z.string().trim().min(1).optional(),
	type: z.enum(["skill", "scene"]),
});

const createProjectDataSchema = z.object({
	name: z.string().trim().min(1),
	prompt: z.string(),
	modelKey: z.string().trim().min(1).optional(),
	folders: z.array(z.string().trim().min(1)).min(1),
	concurrency: z.number().int().min(1).max(64),
	executionMode: executionModeSchema.optional(),
	artifactPatterns: z.array(z.string().trim().min(1)).optional(),
	notifyEnabled: z.boolean().optional(),
	timeoutMinutes: z.number().int().min(1).max(10_080).optional(),
	skill: skillSchema.optional(),
});

const updateProjectDataSchema = z
	.object({
		name: z.string().trim().min(1).optional(),
		prompt: z.string().optional(),
		modelKey: z.string().trim().min(1).optional(),
		concurrency: z.number().int().min(1).max(64).optional(),
		executionMode: executionModeSchema.optional(),
		artifactPatterns: z.array(z.string().trim().min(1)).optional(),
		notifyEnabled: z.boolean().optional(),
		timeoutMinutes: z.number().int().min(1).max(10_080).optional(),
		newFolders: z.array(z.string().trim().min(1)).optional(),
		skill: skillSchema.nullable().optional(),
	})
	.refine((data) => Object.keys(data).length > 0, "update requires at least one field.");

export const batchTasksQueryInputSchema = z.discriminatedUnion("operation", [
	z.object({ operation: z.literal("help") }),
	z.object({ operation: z.literal("list") }),
	z.object({ operation: z.literal("get"), projectId: projectIdSchema }),
]);

export const batchTasksProjectInputSchema = z.discriminatedUnion("operation", [
	z.object({
		operation: z.literal("create"),
		data: createProjectDataSchema,
		approvalUi: projectApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("update"),
		projectId: projectIdSchema,
		data: updateProjectDataSchema,
		approvalUi: projectApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("delete"),
		projectId: projectIdSchema,
		approvalUi: projectApprovalUiSchema,
	}),
]);

export const batchTasksTaskInputSchema = z.discriminatedUnion("operation", [
	z.object({
		operation: z.literal("run"),
		projectId: projectIdSchema,
		taskId: taskIdSchema,
		approvalUi: taskApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("retry"),
		projectId: projectIdSchema,
		taskId: taskIdSchema,
		approvalUi: taskApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("stop"),
		projectId: projectIdSchema,
		taskId: taskIdSchema,
		approvalUi: taskApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("delete"),
		projectId: projectIdSchema,
		taskId: taskIdSchema,
		approvalUi: taskApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("resume"),
		projectId: projectIdSchema,
		taskId: taskIdSchema,
		approvalUi: taskApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("resume-with-text"),
		projectId: projectIdSchema,
		taskId: taskIdSchema,
		text: z.string(),
		approvalUi: taskApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("delete-session"),
		projectId: projectIdSchema,
		taskId: taskIdSchema,
		approvalUi: taskApprovalUiSchema,
	}),
]);

export const batchTasksExecutionInputSchema = z.discriminatedUnion("operation", [
	z.object({
		operation: z.literal("delete-all"),
		projectId: projectIdSchema,
		approvalUi: executionApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("start"),
		projectId: projectIdSchema,
		approvalUi: executionApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("stop"),
		projectId: projectIdSchema,
		approvalUi: executionApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("reset"),
		projectId: projectIdSchema,
		approvalUi: executionApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("reset-failed"),
		projectId: projectIdSchema,
		taskIds: z.array(taskIdSchema).min(1),
		approvalUi: executionApprovalUiSchema,
	}),
]);

export type BatchTasksQueryInput = z.infer<typeof batchTasksQueryInputSchema>;
export type BatchTasksProjectInput = z.infer<typeof batchTasksProjectInputSchema>;
export type BatchTasksTaskInput = z.infer<typeof batchTasksTaskInputSchema>;
export type BatchTasksExecutionInput = z.infer<typeof batchTasksExecutionInputSchema>;

function validate<T>(schema: z.ZodType<T>, input: unknown, actionId: string): JsonValue {
	const result = schema.safeParse(input);
	if (!result.success) {
		throw new ActionError("ACTION_INVALID_INPUT", `Input must match the ${actionId} schema.`, {
			issues: result.error.issues.map((issue) => ({
				path: issue.path.map(String).join("."),
				message: issue.message,
			})),
		});
	}
	return result.data as JsonValue;
}

export function validateBatchTasksQueryInput(input: unknown): JsonValue {
	return validate(batchTasksQueryInputSchema, input, "batch-tasks.query");
}

export function validateBatchTasksProjectInput(input: unknown): JsonValue {
	return validate(batchTasksProjectInputSchema, input, "batch-tasks.project");
}

export function validateBatchTasksTaskInput(input: unknown): JsonValue {
	return validate(batchTasksTaskInputSchema, input, "batch-tasks.task");
}

export function validateBatchTasksExecutionInput(input: unknown): JsonValue {
	return validate(batchTasksExecutionInputSchema, input, "batch-tasks.execution");
}
