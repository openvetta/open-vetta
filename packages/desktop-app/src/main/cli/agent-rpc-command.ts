// ---------------------------------------------------------------------------
// Coding-agent RPC CLI mode
// ---------------------------------------------------------------------------
// When the parent process spawns Vetta.app with `--agent-rpc` (followed by
// the coding-agent CLI args), main.ts short-circuits into this command:
// we forward everything after `--agent-rpc` to `@vetta/coding-agent`'s
// `main`, which speaks the long-lived stdin/stdout RPC protocol the IM
// sidecar consumes.
//
// Production-only motivation: a packaged Vetta.app does not ship a
// standalone `vetta` CLI on PATH, so im-gateway cannot spawn coding-agent
// as a subprocess by name. Reusing Vetta.app's own executable avoids
// shipping a second binary.

const AGENT_RPC_FLAG = "--agent-rpc";

/**
 * Returns the arg list to forward to coding-agent, or null when the
 * discriminator flag is absent. Stripping the flag itself keeps
 * coding-agent's argument parser happy.
 */
export function parseAgentRpcCommand(argv: string[]): string[] | null {
	const idx = argv.indexOf(AGENT_RPC_FLAG);
	if (idx === -1) return null;
	// Everything after the flag is coding-agent's argv. The args before it
	// are Electron's own bootstrapping (executable path, main entry in dev)
	// which we deliberately drop.
	return argv.slice(idx + 1);
}

export async function runAgentRpcCommand(args: string[]): Promise<number> {
	try {
		const { main } = await import("@vetta/coding-agent");
		await main(args);
		return typeof process.exitCode === "number" ? process.exitCode : 0;
	} catch (err) {
		const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
		process.stderr.write(`${msg}\n`);
		return 1;
	}
}
