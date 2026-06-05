import { z } from "zod";
import { ActionError, type JsonValue } from "../types.js";

export const navigationApprovalUiSchema = z.enum(["navigation.open", "generic"]);
export const navigationActionInputSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("help"),
	}),
	z.object({
		type: z.literal("open"),
		target: z.string().trim().min(1),
		tab: z.string().trim().min(1).optional(),
		section: z.string().trim().min(1).optional(),
		approvalUi: navigationApprovalUiSchema.optional(),
	}),
]);

export type NavigationActionInput = z.infer<typeof navigationActionInputSchema>;

export function validateNavigationActionInput(input: unknown): JsonValue {
	const result = navigationActionInputSchema.safeParse(input);
	if (!result.success) {
		throw new ActionError("ACTION_INVALID_INPUT", "Input must match the navigation action schema.", {
			issues: result.error.issues.map((issue) => ({
				path: issue.path.map(String).join("."),
				message: issue.message,
			})),
		});
	}
	return result.data as JsonValue;
}
