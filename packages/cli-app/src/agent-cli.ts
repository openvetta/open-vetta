import { parseAgentRuntimeSelection, runAgentRuntimeCli } from "./agent-runtime-selection.js";
import { installRpcStdoutGuard } from "./rpc/rpc-stdout-guard.js";

const args = process.argv.slice(2);
if (parseAgentRuntimeSelection(args).backend === "greenfield-im") installRpcStdoutGuard();
await runAgentRuntimeCli(args);
