import { classifyAgentCliIntent } from "./agent-cli-intent.js";
import {
	parseAgentRuntimeSelection,
	type RunAgentRuntimeCliOptions,
	runAgentRuntimeCli,
	writeAgentRuntimeDecision,
} from "./agent-runtime-selection.js";
import { installRpcStdoutGuard } from "./rpc/rpc-stdout-guard.js";

export type RunAgentCliOptions = Pick<RunAgentRuntimeCliOptions, "htmlExporter">;

export async function runAgentCli(args: readonly string[], options: RunAgentCliOptions = {}): Promise<void> {
	const selection = parseAgentRuntimeSelection(args);
	const intent = classifyAgentCliIntent(selection.agentArgs);
	if (intent === "rpc") {
		installRpcStdoutGuard();
	}
	await runAgentRuntimeCli(args, { ...options, onDecision: writeAgentRuntimeDecision });
}
