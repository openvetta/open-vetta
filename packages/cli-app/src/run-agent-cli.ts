import { parseAgentRuntimeSelection, runAgentRuntimeCli } from "./agent-runtime-selection.js";
import { installRpcStdoutGuard } from "./rpc/rpc-stdout-guard.js";

export async function runAgentCli(args: readonly string[]): Promise<void> {
	const selection = parseAgentRuntimeSelection(args);
	if (selection.backend === "greenfield-im" || requestsRpcMode(selection.agentArgs)) installRpcStdoutGuard();
	await runAgentRuntimeCli(args);
}

function requestsRpcMode(args: readonly string[]): boolean {
	return args.some((arg, index) => arg === "--mode" && args[index + 1] === "rpc");
}
