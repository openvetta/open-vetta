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

export type CodingToolActivation =
	| {
			readonly mode: "scope";
			readonly scope?: CodingToolScope;
			readonly additionallyEnabledToolNames?: readonly string[];
	  }
	| {
			readonly mode: "explicit";
			readonly toolNames: readonly string[];
	  };

export function selectCodingTools(
	registrations: readonly CodingToolRegistration[],
	activation: CodingToolActivation,
): readonly RuntimeToolDefinition[] {
	if (activation.mode === "explicit") {
		const explicitlyEnabled = new Set(activation.toolNames);
		return registrations
			.filter((registration) => explicitlyEnabled.has(registration.tool.name))
			.map(({ tool }) => tool);
	}

	const scope = activation.scope ?? DEFAULT_CODING_TOOL_SCOPE;
	const additionallyEnabled = new Set(activation.additionallyEnabledToolNames ?? []);
	return registrations
		.filter(
			(registration) => registration.scopeUse.includes(scope) || additionallyEnabled.has(registration.tool.name),
		)
		.map(({ tool }) => tool);
}

export function selectCodingToolsForScope(
	registrations: readonly CodingToolRegistration[],
	scope: CodingToolScope,
): readonly RuntimeToolDefinition[] {
	return selectCodingTools(registrations, { mode: "scope", scope });
}
