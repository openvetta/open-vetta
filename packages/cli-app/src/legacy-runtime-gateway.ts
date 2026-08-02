import type { CodingAgentHostBootstrap } from "@vetta/coding-agent/bootstrap";
import { main as runLegacyAgent, runLegacyAgentWithBootstrap } from "@vetta/coding-agent/legacy/cli";
import type { RpcRuntimeDecision } from "@vetta/coding-agent/rpc";
import type { AutomaticLegacyRuntimeFallbackEvidence } from "./rpc/legacy-runtime-fallback-policy.js";

export type LegacyRuntimeExecutionRequest =
	| {
			readonly cause: "explicit-selection";
			readonly args: readonly string[];
	  }
	| {
			readonly cause: "session-migration-gap";
			readonly bootstrap: CodingAgentHostBootstrap;
			readonly evidence: AutomaticLegacyRuntimeFallbackEvidence;
			readonly runtimeDecision: RpcRuntimeDecision;
	  };

/** The only production CLI boundary allowed to start the Legacy Agent implementation. */
export async function runLegacyRuntimeExecution(request: LegacyRuntimeExecutionRequest): Promise<void> {
	switch (request.cause) {
		case "explicit-selection":
			await runLegacyAgent([...request.args]);
			return;
		case "session-migration-gap":
			assertFallbackReason(request.evidence.reason, "legacy-session", request.cause);
			await runLegacyAgentWithBootstrap(request.bootstrap, { rpcRuntimeDecision: request.runtimeDecision });
			return;
		default:
			assertNever(request);
	}
}

function assertFallbackReason(
	actual: AutomaticLegacyRuntimeFallbackEvidence["reason"],
	expected: AutomaticLegacyRuntimeFallbackEvidence["reason"],
	cause: LegacyRuntimeExecutionRequest["cause"],
): void {
	if (actual !== expected) throw new Error(`Legacy execution cause ${cause} does not match fallback reason ${actual}`);
}

function assertNever(value: never): never {
	throw new Error(`Unsupported Legacy runtime execution request: ${String(value)}`);
}
