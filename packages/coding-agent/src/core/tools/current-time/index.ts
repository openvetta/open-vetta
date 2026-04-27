import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import { loadToolDescription } from "../description.js";

const currentTimeSchema = Type.Object({});

export type CurrentTimeToolInput = Record<string, never>;

export interface CurrentTimeToolDetails {
	timestamp: string;
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

export function createCurrentTimeTool(): AgentTool<typeof currentTimeSchema, CurrentTimeToolDetails> {
	const fallbackDescription = "Get the current system time. Returns the time in YYYY-MM-DD HH:mm:ss format.";
	const description = loadToolDescription(import.meta.url, fallbackDescription);

	return {
		name: "current_time",
		label: "Current Time",
		description,
		parameters: currentTimeSchema,
		execute: async (_toolCallId: string) => {
			const now = new Date();
			const formatted = formatDateTime(now);
			return {
				content: [{ type: "text", text: formatted }],
				details: { timestamp: formatted },
			};
		},
	};
}

/** Default current_time tool instance */
export const currentTimeTool = createCurrentTimeTool();
