import { z } from "zod";
import {
	isShortcutActionId,
	isValidShortcutCombo,
	normalizeShortcutCombo,
	SHORTCUT_ACTIONS,
} from "../../../shared/shortcuts.js";
import { operationApprovalUiSchema, validateActionInput } from "../shared.js";
import type { JsonValue } from "../types.js";

const shortcutActionIdSchema = z.string().refine((value) => isShortcutActionId(value), {
	message: `id must be one of: ${SHORTCUT_ACTIONS.map((a) => a.id).join(", ")}`,
});

const shortcutComboSchema = z
	.string()
	.trim()
	.min(1)
	.transform((value) => normalizeShortcutCombo(value))
	.refine((value) => isValidShortcutCombo(value), {
		message: 'shortcut must look like "mod+n" / "mod+shift+o" (modifiers: mod, ctrl, shift, alt).',
	});

const quickPanelTriggerSchema = z.enum(["none", "mod", "alt", "shift"]);
const quickPanelBehaviorSchema = z.enum(["foreground", "background"]);

export const shortcutsQueryInputSchema = z.discriminatedUnion("operation", [
	z.object({ operation: z.literal("help") }),
	z.object({ operation: z.literal("get") }),
]);

export const shortcutsManageInputSchema = z.discriminatedUnion("operation", [
	z.object({
		operation: z.literal("set-binding"),
		id: shortcutActionIdSchema,
		shortcut: shortcutComboSchema,
		approvalUi: operationApprovalUiSchema("shortcuts.set-binding"),
	}),
	z.object({
		operation: z.literal("reset-binding"),
		id: shortcutActionIdSchema,
		approvalUi: operationApprovalUiSchema("shortcuts.reset-binding"),
	}),
	z.object({
		operation: z.literal("reset-all-bindings"),
		approvalUi: operationApprovalUiSchema("shortcuts.reset-all-bindings"),
	}),
	z.object({
		operation: z.literal("set-quick-panel-trigger"),
		trigger: quickPanelTriggerSchema,
		approvalUi: operationApprovalUiSchema("shortcuts.set-quick-panel-trigger"),
	}),
	z.object({
		operation: z.literal("set-quick-panel-behavior"),
		behavior: quickPanelBehaviorSchema,
		approvalUi: operationApprovalUiSchema("shortcuts.set-quick-panel-behavior"),
	}),
]);

export type ShortcutsQueryInput = z.infer<typeof shortcutsQueryInputSchema>;
export type ShortcutsManageInput = z.infer<typeof shortcutsManageInputSchema>;

export function validateShortcutsQueryInput(input: unknown): JsonValue {
	return validateActionInput(shortcutsQueryInputSchema, input, "shortcuts.query");
}

export function validateShortcutsManageInput(input: unknown): JsonValue {
	return validateActionInput(shortcutsManageInputSchema, input, "shortcuts.manage");
}
