import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import type { CodingToolCatalog } from "./coding-tool-catalog.js";
import type { CodingToolRegistration } from "./tool-registration.js";

export const CODING_TOOL_AVAILABILITY_ERROR_CODES = {
	UNAVAILABLE: "coding_tool_unavailable",
	DEFINITION_CHANGED: "coding_tool_definition_changed",
} as const;

export type CodingToolAvailabilityErrorCode =
	(typeof CODING_TOOL_AVAILABILITY_ERROR_CODES)[keyof typeof CODING_TOOL_AVAILABILITY_ERROR_CODES];

export class CodingToolAvailabilityError extends Error {
	readonly code: CodingToolAvailabilityErrorCode;
	readonly toolName: string;

	constructor(code: CodingToolAvailabilityErrorCode, toolName: string, message: string) {
		super(message);
		this.name = "CodingToolAvailabilityError";
		this.code = code;
		this.toolName = toolName;
	}
}

export function guardCodingToolRegistration(
	catalog: CodingToolCatalog,
	registration: CodingToolRegistration,
): RuntimeToolDefinition {
	const advertisedTool = registration.tool;
	return {
		...advertisedTool,
		async execute(request) {
			const current = catalog.resolve(advertisedTool.name);
			if (!current) {
				throw new CodingToolAvailabilityError(
					CODING_TOOL_AVAILABILITY_ERROR_CODES.UNAVAILABLE,
					advertisedTool.name,
					`Coding tool is no longer available: ${advertisedTool.name}`,
				);
			}
			if (current !== registration) {
				throw new CodingToolAvailabilityError(
					CODING_TOOL_AVAILABILITY_ERROR_CODES.DEFINITION_CHANGED,
					advertisedTool.name,
					`Coding tool definition changed after it was advertised: ${advertisedTool.name}`,
				);
			}
			return advertisedTool.execute(request);
		},
	};
}
