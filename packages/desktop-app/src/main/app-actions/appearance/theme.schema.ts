import { z } from "zod";
import { ActionError, type JsonValue } from "../types.js";

export const themeModeSchema = z.enum(["light", "dark", "auto"]);
export const cursorStyleSchema = z.enum(["default", "stoat"]);
export const appLanguageSchema = z.enum(["zh", "en"]);
export const themeApprovalUiSchema = z.enum([
	"appearance.theme-change",
	"appearance.picker",
	"appearance.set-language",
	"generic",
]);
export const themeActionInputSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("help"),
	}),
	z.object({
		type: z.literal("get"),
	}),
	z
		.object({
			type: z.literal("set"),
			mode: themeModeSchema.optional(),
			themeId: z.string().trim().min(1).optional(),
			cursorStyle: cursorStyleSchema.optional(),
			approvalUi: themeApprovalUiSchema.optional(),
		})
		.refine(
			(input) =>
				input.mode !== undefined ||
				input.themeId !== undefined ||
				input.cursorStyle !== undefined ||
				input.approvalUi === "appearance.picker",
			{
				message: "set requires mode, themeId, or cursorStyle unless approvalUi is appearance.picker.",
			},
		),
	z.object({
		type: z.literal("set-language"),
		language: appLanguageSchema,
		approvalUi: z
			.union([z.literal("appearance.set-language"), z.literal("generic")])
			.optional()
			.default("appearance.set-language"),
	}),
]);
export const rendererThemeSnapshotSchema = z.object({
	mode: themeModeSchema,
	themeId: z.string().min(1),
	resolved: z.enum(["light", "dark"]).nullable(),
	appliedThemeId: z.string().nullable(),
	cursorStyle: cursorStyleSchema,
});
export const rendererThemeResponseSchema = z.object({
	requestId: z.string(),
	state: rendererThemeSnapshotSchema.optional(),
	error: z.string().optional(),
});
export const rendererThemeHelpSchema = z.object({
	state: rendererThemeSnapshotSchema,
	themes: z.array(
		z.object({
			id: z.string().min(1),
			label: z.string().min(1),
		}),
	),
});
export const rendererThemeHelpResponseSchema = z.object({
	requestId: z.string(),
	help: rendererThemeHelpSchema.optional(),
	error: z.string().optional(),
});

export type ThemeMode = z.infer<typeof themeModeSchema>;
export type CursorStyle = z.infer<typeof cursorStyleSchema>;
export type ThemeActionInput = z.infer<typeof themeActionInputSchema>;
export type RendererThemeSnapshot = z.infer<typeof rendererThemeSnapshotSchema>;
export type RendererThemeHelp = z.infer<typeof rendererThemeHelpSchema>;

export function validateThemeActionInput(input: unknown): JsonValue {
	const result = themeActionInputSchema.safeParse(input);
	if (!result.success) {
		throw new ActionError("ACTION_INVALID_INPUT", "Input must match the appearance theme action schema.", {
			issues: result.error.issues.map((issue) => ({
				path: issue.path.map(String).join("."),
				message: issue.message,
			})),
		});
	}
	return result.data as JsonValue;
}
