import { z } from "zod";
import { genericApprovalUiSchema, validateActionInput } from "../shared.js";
import type { JsonValue } from "../types.js";

export const skillsQueryInputSchema = z.discriminatedUnion("operation", [
	z.object({ operation: z.literal("help") }),
	z.object({ operation: z.literal("list"), cwd: z.string().trim().min(1).optional() }),
	z.object({ operation: z.literal("manifest") }),
]);

export const skillsManageInputSchema = z.discriminatedUnion("operation", [
	z.object({
		operation: z.literal("set-enabled"),
		name: z.string().trim().min(1),
		enabled: z.boolean(),
		approvalUi: genericApprovalUiSchema,
	}),
	z.object({
		operation: z.literal("uninstall"),
		name: z.string().trim().min(1),
		type: z.enum(["skill", "scene"]).optional(),
		approvalUi: genericApprovalUiSchema,
	}),
]);

export type SkillsQueryInput = z.infer<typeof skillsQueryInputSchema>;
export type SkillsManageInput = z.infer<typeof skillsManageInputSchema>;

export function validateSkillsQueryInput(input: unknown): JsonValue {
	return validateActionInput(skillsQueryInputSchema, input, "skills.query");
}

export function validateSkillsManageInput(input: unknown): JsonValue {
	return validateActionInput(skillsManageInputSchema, input, "skills.manage");
}
