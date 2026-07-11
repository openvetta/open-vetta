import { z } from "zod";
import { operationApprovalUiSchema, validateActionInput } from "../shared.js";
import type { JsonValue } from "../types.js";

/** 设置 → Agent 配置：实验功能等。 */
export const agentQueryInputSchema = z.discriminatedUnion("operation", [
	z.object({ operation: z.literal("help") }),
	z.object({ operation: z.literal("get") }),
]);

export const agentManageInputSchema = z.discriminatedUnion("operation", [
	z.object({
		operation: z.literal("set-experimental"),
		data: z
			.object({
				vettaCli: z.boolean().optional(),
				promptPrediction: z.boolean().optional(),
				agentSkills: z.boolean().optional(),
			})
			.refine((data) => Object.keys(data).length > 0, "set-experimental requires at least one field."),
		approvalUi: operationApprovalUiSchema("agent.set-experimental"),
	}),
]);

export type AgentQueryInput = z.infer<typeof agentQueryInputSchema>;
export type AgentManageInput = z.infer<typeof agentManageInputSchema>;

export function validateAgentQueryInput(input: unknown): JsonValue {
	return validateActionInput(agentQueryInputSchema, input, "agent.query");
}

export function validateAgentManageInput(input: unknown): JsonValue {
	return validateActionInput(agentManageInputSchema, input, "agent.manage");
}
