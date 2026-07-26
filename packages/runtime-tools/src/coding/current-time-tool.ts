import { type Static, Type } from "@sinclair/typebox";
import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";

export const CurrentTimeToolInputSchema = Type.Object(
	{
		description: Type.Optional(
			Type.String({
				description: "Brief user-facing reason for this tool call.",
				maxLength: 100,
			}),
		),
	},
	{ additionalProperties: false },
);

export type CurrentTimeToolInput = Static<typeof CurrentTimeToolInputSchema>;

export interface CurrentTimeToolDetails {
	readonly timestamp: string;
}

export interface CurrentTimeToolOptions {
	readonly now?: () => Date;
}

export function createCurrentTimeTool(
	options: CurrentTimeToolOptions = {},
): RuntimeToolDefinition<CurrentTimeToolInput> {
	const now = options.now ?? (() => new Date());

	return {
		name: "current_time",
		label: "Current Time",
		description: "Get the current system time in YYYY-MM-DD HH:mm:ss format.",
		inputSchema: CurrentTimeToolInputSchema,
		async execute(request) {
			request.signal.throwIfAborted();
			const timestamp = formatDateTime(now());
			request.signal.throwIfAborted();
			return {
				content: [{ type: "text", text: timestamp }],
				details: {
					timestamp,
				} satisfies CurrentTimeToolDetails,
			};
		},
	};
}

function formatDateTime(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	const seconds = String(date.getSeconds()).padStart(2, "0");
	return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
