export type CodingAgentLegacyExtensionRuntimeCapability =
	| "opaque-runtime-api"
	| "event-handler"
	| "tool"
	| "command"
	| "shortcut"
	| "message-renderer";

interface CodingAgentLoadedExtensionRegistrations {
	readonly path: string;
	readonly handlers: ReadonlyMap<string, readonly unknown[]>;
	readonly tools: ReadonlyMap<unknown, unknown>;
	readonly commands: ReadonlyMap<unknown, unknown>;
	readonly shortcuts: ReadonlyMap<unknown, unknown>;
	readonly flags: ReadonlyMap<unknown, unknown>;
	readonly messageRenderers: ReadonlyMap<unknown, unknown>;
}

export interface CodingAgentExtensionRegistrationSummary {
	readonly path: string;
	readonly events: readonly string[];
	readonly tools: readonly string[];
	readonly commands: readonly string[];
	readonly shortcuts: readonly string[];
	readonly flags: readonly string[];
	readonly messageRenderers: readonly string[];
}

export interface CodingAgentExtensionBootstrapContributions {
	readonly providers: readonly string[];
	readonly flags: readonly string[];
}

export interface CodingAgentExtensionCompatibilityAssessment {
	readonly extensionCount: number;
	readonly bootstrapContributions: CodingAgentExtensionBootstrapContributions;
	readonly registrations: readonly CodingAgentExtensionRegistrationSummary[];
	readonly requiredRuntimeCapabilities: readonly CodingAgentLegacyExtensionRuntimeCapability[];
	readonly unmetRuntimeCapabilities: readonly CodingAgentLegacyExtensionRuntimeCapability[];
	readonly unsupportedEvents: readonly string[];
	readonly requiresLegacyRuntime: boolean;
}

interface AssessCodingAgentExtensionCompatibilityInput {
	readonly extensions: readonly CodingAgentLoadedExtensionRegistrations[];
	readonly pendingProviderNames: readonly string[];
}

const RUNTIME_CAPABILITY_ORDER: readonly CodingAgentLegacyExtensionRuntimeCapability[] = [
	"opaque-runtime-api",
	"event-handler",
	"tool",
	"command",
	"shortcut",
	"message-renderer",
];

export const CODING_AGENT_GREENFIELD_EXTENSION_EVENTS = [
	"input",
	"before_agent_start",
	"session_start",
	"session_shutdown",
	"agent_start",
	"agent_end",
	"turn_start",
	"turn_end",
	"message_start",
	"message_update",
	"message_end",
	"context",
	"tool_call",
	"tool_result",
	"tool_execution_start",
	"tool_execution_update",
	"tool_execution_phase",
	"tool_execution_end",
] as const;

/**
 * 将旧 Extension 注册面投影为宿主可消费的兼容性事实。
 *
 * Extension factory 可以长期持有 ExtensionAPI，并在注册回调之外调用命令式 API。
 * 在完整 Runtime API Adapter 建立前，任何已加载 Extension 都必须保留
 * `opaque-runtime-api` 缺口，不能仅凭注册表为空推断 Greenfield 安全。
 */
export function assessCodingAgentExtensionCompatibility(
	input: AssessCodingAgentExtensionCompatibilityInput,
): CodingAgentExtensionCompatibilityAssessment {
	const registrations = input.extensions
		.map(summarizeExtensionRegistrations)
		.sort((left, right) => left.path.localeCompare(right.path));
	const required = new Set<CodingAgentLegacyExtensionRuntimeCapability>();
	if (registrations.length > 0) required.add("opaque-runtime-api");

	for (const registration of registrations) {
		if (registration.events.length > 0) required.add("event-handler");
		if (registration.tools.length > 0) required.add("tool");
		if (registration.commands.length > 0) required.add("command");
		if (registration.shortcuts.length > 0) required.add("shortcut");
		if (registration.messageRenderers.length > 0) required.add("message-renderer");
	}

	const requiredRuntimeCapabilities = RUNTIME_CAPABILITY_ORDER.filter((capability) => required.has(capability));
	const bootstrapContributions = {
		providers: sortedUnique(input.pendingProviderNames),
		flags: sortedUnique(registrations.flatMap((registration) => registration.flags)),
	};

	return {
		extensionCount: registrations.length,
		bootstrapContributions,
		registrations,
		requiredRuntimeCapabilities,
		unmetRuntimeCapabilities: requiredRuntimeCapabilities,
		unsupportedEvents: sortedUnique(registrations.flatMap((registration) => registration.events)),
		requiresLegacyRuntime: requiredRuntimeCapabilities.length > 0,
	};
}

/**
 * Greenfield Action Host 已覆盖命令式 API；事件能力按具体事件名消除缺口。
 * Tool 注册、Command、Shortcut 与 Renderer 仍按独立能力回退。
 */
export function resolveCodingAgentGreenfieldExtensionCompatibility(
	assessment: CodingAgentExtensionCompatibilityAssessment,
	supportedEvents: readonly string[] = CODING_AGENT_GREENFIELD_EXTENSION_EVENTS,
): CodingAgentExtensionCompatibilityAssessment {
	const supported = new Set(supportedEvents);
	const unsupportedEvents = sortedUnique(
		assessment.registrations.flatMap((registration) => registration.events.filter((event) => !supported.has(event))),
	);
	const unmetRuntimeCapabilities = assessment.unmetRuntimeCapabilities.filter(
		(capability) =>
			capability !== "opaque-runtime-api" && (capability !== "event-handler" || unsupportedEvents.length > 0),
	);
	return {
		...assessment,
		unmetRuntimeCapabilities,
		unsupportedEvents,
		requiresLegacyRuntime: unmetRuntimeCapabilities.length > 0,
	};
}

function summarizeExtensionRegistrations(
	extension: CodingAgentLoadedExtensionRegistrations,
): CodingAgentExtensionRegistrationSummary {
	return {
		path: extension.path,
		events: [...extension.handlers]
			.filter(([, handlers]) => handlers.length > 0)
			.map(([event]) => event)
			.sort(),
		tools: sortedMapKeys(extension.tools),
		commands: sortedMapKeys(extension.commands),
		shortcuts: sortedMapKeys(extension.shortcuts),
		flags: sortedMapKeys(extension.flags),
		messageRenderers: sortedMapKeys(extension.messageRenderers),
	};
}

function sortedMapKeys(map: ReadonlyMap<unknown, unknown>): readonly string[] {
	return sortedUnique([...map.keys()].map(String));
}

function sortedUnique(values: readonly string[]): readonly string[] {
	return [...new Set(values)].sort();
}
