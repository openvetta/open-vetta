#!/usr/bin/env node

import { runAgentRuntimeCli, writeAgentRuntimeDecision } from "./agent-runtime-selection.js";
import { installRpcStdoutGuard } from "./rpc/rpc-stdout-guard.js";

installRpcStdoutGuard();

try {
	await runAgentRuntimeCli(process.argv.slice(2), { onDecision: writeAgentRuntimeDecision });
} catch (error) {
	console.error(error instanceof Error ? error.stack : error);
	process.exitCode = 1;
}
