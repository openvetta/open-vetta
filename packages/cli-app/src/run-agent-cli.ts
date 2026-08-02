import { classifyAgentCliIntent } from "./agent-cli-intent.js";
import {
	parseAgentRuntimeSelection,
	runAgentRuntimeCli,
	writeAgentRuntimeDecision,
} from "./agent-runtime-selection.js";
import { installRpcStdoutGuard } from "./rpc/rpc-stdout-guard.js";

export async function runAgentCli(args: readonly string[]): Promise<void> {
	const selection = parseAgentRuntimeSelection(args);
	const intent = classifyAgentCliIntent(selection.agentArgs);
	if (intent === "rpc") {
		installRpcStdoutGuard();
	}
	await runAgentRuntimeCli(args, { onDecision: writeAgentRuntimeDecision });
}
