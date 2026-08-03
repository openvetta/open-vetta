import type { CodingAgentExtensionCompatibilityAssessment } from "@vetta/coding-agent/bootstrap";
import type { RpcExtensionIncompatibilityFailure, RpcRuntimeDecision } from "@vetta/coding-agent/rpc";

type RequestedRuntimeBackend = RpcRuntimeDecision["requestedBackend"];

export class ExtensionCompatibilityError extends Error {
	readonly errorCode = "extension_incompatible";
	readonly requestedBackend: RequestedRuntimeBackend;
	readonly unsupportedEvents: readonly string[];
	readonly unmetRuntimeCapabilities: readonly string[];

	constructor(requestedBackend: RequestedRuntimeBackend, assessment: CodingAgentExtensionCompatibilityAssessment) {
		super("Extension requires events or runtime capabilities that are not supported by the requested runtime");
		this.name = "ExtensionCompatibilityError";
		this.requestedBackend = requestedBackend;
		this.unsupportedEvents = [...assessment.unsupportedEvents];
		this.unmetRuntimeCapabilities = [...assessment.unmetRuntimeCapabilities];
	}

	toRpcStartupFailure(): RpcExtensionIncompatibilityFailure {
		return {
			type: "response",
			command: "startup",
			success: false,
			errorCode: this.errorCode,
			error: this.message,
			requestedBackend: this.requestedBackend,
			unsupportedEvents: [...this.unsupportedEvents],
			unmetRuntimeCapabilities: [...this.unmetRuntimeCapabilities],
		};
	}
}
