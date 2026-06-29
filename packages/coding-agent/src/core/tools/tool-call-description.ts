import { Type } from "@sinclair/typebox";

export const toolCallDescriptionSchema = Type.Optional(
	Type.String({
		description: "Brief user-facing reason for this tool call (max 20 chars).",
		maxLength: 20,
	}),
);
