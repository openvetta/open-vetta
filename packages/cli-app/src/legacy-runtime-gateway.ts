import { main as runLegacyAgent } from "@vetta/coding-agent/legacy/cli";

export type LegacyRuntimeExecutionRequest = {
	readonly cause: "explicit-selection";
	readonly args: readonly string[];
};

/** The only production CLI boundary allowed to start the Legacy Agent implementation. */
export async function runLegacyRuntimeExecution(request: LegacyRuntimeExecutionRequest): Promise<void> {
	await runLegacyAgent([...request.args]);
}
