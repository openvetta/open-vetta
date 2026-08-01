export type {
	CodingAgentExtensionBootstrapContributions,
	CodingAgentExtensionCompatibilityAssessment,
	CodingAgentExtensionEventCompatibilityProfile,
	CodingAgentExtensionEventCompatibilityStatus,
	CodingAgentExtensionEventType,
	CodingAgentExtensionRegistrationSummary,
	CodingAgentGreenfieldExtensionHostCapabilities,
	CodingAgentLegacyExtensionRuntimeCapability,
} from "../host/coding-agent-extension-compatibility.js";
export {
	CODING_AGENT_GREENFIELD_EXTENSION_EVENTS,
	resolveCodingAgentGreenfieldExtensionCompatibility,
} from "../host/coding-agent-extension-compatibility.js";
export {
	type CodingAgentHostBootstrap,
	type CodingAgentHostBootstrapDiagnostics,
	type CodingAgentHostBootstrapOptions,
	type CodingAgentInitialModelResolution,
	createCodingAgentHostBootstrap,
	resolveCodingAgentInitialModel,
} from "../host/coding-agent-host-bootstrap.js";
export { createAgentCliBootstrap } from "../main.js";
