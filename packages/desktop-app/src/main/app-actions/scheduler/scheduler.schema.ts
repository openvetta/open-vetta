import { z } from "zod";
import { isValidCronExpression } from "../../scheduler/cron.js";
import { ActionError, type JsonValue } from "../types.js";

const taskIdSchema = z.string().trim().min(1);
const executionModeSchema = z.enum(["inherit", "sandbox", "full-access"]);
const cronSchema = z.string().trim().refine(isValidCronExpression, "Invalid cron expression.");
const skillSchema = z.object({
	name: z.string().trim().min(1),
	alias: z.string().trim().min(1).optional(),
	type: z.enum(["skill", "scene"]),
});

const createTaskDataSchema = z.object({
	name: z.string().trim().min(1),
	prompt: z.string().trim().min(1),
	cron: cronSchema,
	isOnce: z.boolean(),
	enabled: z.boolean().optional().default(true),
	cwd: z.string().trim().min(1),
	modelKey: z.string().trim().min(1).optional(),
	executionMode: executionModeSchema.optional(),
	skill: skillSchema.optional(),
});

const updateTaskDataSchema = z
	.object({
		name: z.string().trim().min(1).optional(),
		prompt: z.string().trim().min(1).optional(),
		cron: cronSchema.optional(),
		isOnce: z.boolean().optional(),
		enabled: z.boolean().optional(),
		cwd: z.string().trim().min(1).optional(),
		modelKey: z.string().trim().min(1).nullable().optional(),
		executionMode: executionModeSchema.optional(),
		skill: skillSchema.nullable().optional(),
	})
	.refine((data) => Object.keys(data).length > 0, "update requires at least one field.");

export const schedulerQueryInputSchema = z.discriminatedUnion("operation", [
	z.object({ operation: z.literal("help") }),
	z.object({ operation: z.literal("list") }),
	z.object({ operation: z.literal("get"), taskId: taskIdSchema }),
	z.object({ operation: z.literal("history"), taskId: taskIdSchema }),
]);

export const schedulerTaskInputSchema = z.discriminatedUnion("operation", [
	z.object({
		operation: z.literal("create"),
		data: createTaskDataSchema,
		approvalUi: z.literal("scheduler.create").optional().default("scheduler.create"),
	}),
	z.object({
		operation: z.literal("update"),
		taskId: taskIdSchema,
		data: updateTaskDataSchema,
		approvalUi: z.literal("scheduler.update").optional().default("scheduler.update"),
	}),
	z.object({
		operation: z.literal("delete"),
		taskId: taskIdSchema,
		approvalUi: z.literal("scheduler.delete").optional().default("scheduler.delete"),
	}),
	z.object({
		operation: z.literal("enable"),
		taskId: taskIdSchema,
		approvalUi: z.literal("scheduler.toggle").optional().default("scheduler.toggle"),
	}),
	z.object({
		operation: z.literal("disable"),
		taskId: taskIdSchema,
		approvalUi: z.literal("scheduler.toggle").optional().default("scheduler.toggle"),
	}),
]);

export const schedulerExecutionInputSchema = z.discriminatedUnion("operation", [
	z.object({
		operation: z.literal("run-now"),
		taskId: taskIdSchema,
		approvalUi: z.literal("scheduler.run-now").optional().default("scheduler.run-now"),
	}),
	z.object({
		operation: z.literal("abort"),
		taskId: taskIdSchema,
		approvalUi: z.literal("scheduler.abort").optional().default("scheduler.abort"),
	}),
]);

export type SchedulerQueryInput = z.infer<typeof schedulerQueryInputSchema>;
export type SchedulerTaskInput = z.infer<typeof schedulerTaskInputSchema>;
export type SchedulerExecutionInput = z.infer<typeof schedulerExecutionInputSchema>;

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

export function validateSchedulerQueryInput(input: unknown): JsonValue {
	return validate(schedulerQueryInputSchema, input, "scheduler.query");
}

export function validateSchedulerTaskInput(input: unknown): JsonValue {
	return validate(schedulerTaskInputSchema, input, "scheduler.task");
}

export function validateSchedulerExecutionInput(input: unknown): JsonValue {
	return validate(schedulerExecutionInputSchema, input, "scheduler.execution");
}
