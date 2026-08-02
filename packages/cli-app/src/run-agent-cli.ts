import {
	parseAgentRuntimeSelection,
	runAgentRuntimeCli,
	writeAgentRuntimeDecision,
} from "./agent-runtime-selection.js";
import { installRpcStdoutGuard } from "./rpc/rpc-stdout-guard.js";

export async function runAgentCli(args: readonly string[]): Promise<void> {
	const selection = parseAgentRuntimeSelection(args);
	if (selection.backend !== "legacy" || requestsRpcMode(selection.agentArgs)) installRpcStdoutGuard();
	await runAgentRuntimeCli(args, { onDecision: writeAgentRuntimeDecision });
}

function requestsRpcMode(args: readonly string[]): boolean {
	return args.some((arg, index) => arg === "--mode" && args[index + 1] === "rpc");
}
