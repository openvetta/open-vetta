import { parseAgentRuntimeSelection, runAgentRuntimeCli } from "./agent-runtime-selection.js";
import { installRpcStdoutGuard } from "./rpc/rpc-stdout-guard.js";

export async function runAgentCli(args: readonly string[]): Promise<void> {
	if (parseAgentRuntimeSelection(args).backend === "greenfield-im") installRpcStdoutGuard();
	await runAgentRuntimeCli(args);
}
