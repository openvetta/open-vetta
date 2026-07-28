export interface PluginCommandRunOptions {
	/** Working directory. Must resolve inside a host-allowed root (e.g. a project). */
	cwd?: string;
	/** Extra environment entries, merged over the host process env (PATH preserved). */
	env?: Record<string, string>;
	/** Hard timeout in ms; the host clamps to its own maximum. */
	timeoutMs?: number;
}

export interface PluginCommandRunResult {
	stdout: string;
	stderr: string;
	/** Process exit code; null when the process was killed by a signal/timeout. */
	exitCode: number | null;
}

/**
 * Run an allowed host command (e.g. `git`). execFile semantics — NO shell, args
 * are passed as an array (no string splitting, no injection). The executable
 * must be declared in plugin.json's `commands` and currently enabled by the
 * user; otherwise the call is rejected (and the host notifies the user). Needs
 * the `agent.command.run` permission.
 */
export interface PluginCommandApi {
	run(file: string, args?: string[], options?: PluginCommandRunOptions): Promise<PluginCommandRunResult>;
}
