import type {
	CodingAgentExtensionCompatibilityAssessment,
	CodingAgentHostBootstrap,
} from "@vetta/coding-agent/bootstrap";
import type { RpcRuntimeDecision } from "@vetta/coding-agent/rpc";

export type GreenfieldRpcFallbackReason = "legacy-session" | "legacy-extension";

/** Compatibility contract retained at the CLI Legacy policy boundary. */
export interface GreenfieldRpcRuntimeHostFallback {
	readonly kind: "legacy-fallback";
	readonly reason: GreenfieldRpcFallbackReason;
	readonly bootstrap: CodingAgentHostBootstrap;
	readonly sessionPath: string | undefined;
	readonly extensionCompatibility?: CodingAgentExtensionCompatibilityAssessment;
	readonly sessionMigration?: RpcRuntimeDecision["sessionMigration"];
}
