import { z } from "zod";
import { operationApprovalUiSchema, validateActionInput } from "../shared.js";
import type { JsonValue } from "../types.js";

const serverNameSchema = z.string().trim().min(1);

const stdioDataSchema = z.object({
	type: z.literal("stdio").optional(),
	command: z.string().trim().min(1).optional(),
	args: z.array(z.string()).optional(),
	env: z.record(z.string(), z.string()).optional(),
	cwd: z.string().trim().min(1).optional(),
	disabled: z.boolean().optional(),
	autoApprove: z.array(z.string()).optional(),
	startupTimeout: z.number().int().positive().optional(),
	debug: z.boolean().optional(),
});

const httpDataSchema = z.object({
	type: z.literal("http"),
	url: z.string().trim().min(1).optional(),
	headers: z.record(z.string(), z.string()).optional(),
	disabled: z.boolean().optional(),
	autoApprove: z.array(z.string()).optional(),
	startupTimeout: z.number().int().positive().optional(),
	debug: z.boolean().optional(),
});

export const mcpQueryInputSchema = z.discriminatedUnion("operation", [
	z.object({ operation: z.literal("help") }),
	z.object({ operation: z.literal("list") }),
	z.object({ operation: z.literal("get"), name: serverNameSchema }),
]);

export const mcpManageInputSchema = z.discriminatedUnion("operation", [
	z.object({
		operation: z.literal("upsert"),
		name: serverNameSchema,
		data: z.union([stdioDataSchema, httpDataSchema]).refine((data) => Object.keys(data).length > 0, {
			message: "upsert requires at least one field",
		}),
		approvalUi: operationApprovalUiSchema("mcp.upsert"),
	}),
	z.object({
		operation: z.literal("set-enabled"),
		name: serverNameSchema,
		enabled: z.boolean(),
		approvalUi: operationApprovalUiSchema("mcp.set-enabled"),
	}),
	z.object({
		operation: z.literal("remove"),
		name: serverNameSchema,
		approvalUi: operationApprovalUiSchema("mcp.remove"),
	}),
]);

export type McpQueryInput = z.infer<typeof mcpQueryInputSchema>;
export type McpManageInput = z.infer<typeof mcpManageInputSchema>;

export function validateMcpQueryInput(input: unknown): JsonValue {
	return validateActionInput(mcpQueryInputSchema, input, "mcp.query");
}

export function validateMcpManageInput(input: unknown): JsonValue {
	return validateActionInput(mcpManageInputSchema, input, "mcp.manage");
}
