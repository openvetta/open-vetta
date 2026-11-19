import { type Static, Type } from "@sinclair/typebox";

export const BlockEditInputSchema = Type.Object({
	oldText: Type.String({
		description:
			"The block's first line, copied from the file (a unique fragment of it is enough; indentation and internal spacing are ignored). A multi-line value must match consecutive lines. If it matches more than one place, add a neighbouring line until it is unique.",
	}),
	oldEndText: Type.Optional(
		Type.String({
			description:
				"Optional last line of the block, copied from the file and searched after oldText. Use it to replace a long block without retyping its middle: everything from oldText's line through oldEndText's line is replaced.",
		}),
	),
	newText: Type.String({
		description:
			"The replacement for those whole lines. File content only — never the `42:` line numbers from read output. Empty string deletes the lines.",
	}),
});

export const EditToolInputSchema = Type.Object({
	description: Type.Optional(
		Type.String({
			description: "Brief user-facing reason for this tool call (max 100 chars).",
			maxLength: 100,
		}),
	),
	path: Type.String({ description: "Path to the file to edit (relative or absolute)" }),
	oldText: Type.Optional(
		Type.String({ description: "Exact text to find and replace (must match exactly and be unique in the file)" }),
	),
	newText: Type.Optional(Type.String({ description: "New text to replace the old text with" })),
	edits: Type.Optional(
		Type.Array(BlockEditInputSchema, {
			description:
				"Batch of content-located block edits against this file (preferred for several changes, or for replacing a long block). Atomic: if any block cannot be located the whole batch is rejected and NO changes are written. Do not combine with oldText/newText.",
		}),
	),
});

export type BlockEditInput = Static<typeof BlockEditInputSchema>;
export type EditToolInput = Static<typeof EditToolInputSchema>;
