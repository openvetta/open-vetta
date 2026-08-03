import { main } from "@vetta/coding-agent/legacy/cli";
import { installRpcStdoutGuard } from "../../src/rpc/rpc-stdout-guard.js";

installRpcStdoutGuard();

try {
	await main(process.argv.slice(2));
} catch (error) {
	console.error(error instanceof Error ? error.stack : error);
	process.exitCode = 1;
}
