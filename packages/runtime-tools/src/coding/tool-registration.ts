import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";

export const CODING_TOOL_SCOPES = [
	"im-claw",
	"conversation",
	"project",
	"batch",
	"automation",
	"kb-processing",
	"cli",
] as const;

export type CodingToolScope = (typeof CODING_TOOL_SCOPES)[number];

export const DEFAULT_CODING_TOOL_SCOPE: CodingToolScope = "cli";

export type CodingToolCategory =
	| "core"
	| "doc"
	| "kb-write"
	| "kb-read"
	| "agent-control"
	| "media"
	| "im"
	| "memory"
	| "external";

export interface CodingToolRegistration<TInput extends object = Readonly<Record<string, unknown>>> {
	readonly tool: RuntimeToolDefinition<TInput>;
	readonly scopeUse: readonly CodingToolScope[];
	readonly category: CodingToolCategory;
}

export function selectCodingToolsForScope(
	registrations: readonly CodingToolRegistration[],
	scope: CodingToolScope,
): readonly RuntimeToolDefinition[] {
	return registrations.filter((registration) => registration.scopeUse.includes(scope)).map(({ tool }) => tool);
}
