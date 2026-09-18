export interface ResolveGrokSessionsDirectoryInput {
	readonly grokHome?: string;
	readonly homeDirectory: string;
	join(...parts: readonly string[]): string;
}

/**
 * Grok stores sessions under `$GROK_HOME/sessions`. When GROK_HOME is unset,
 * that root is `~/.grok`. The host supplies `join` so this policy stays Node-free.
 */
export function resolveGrokSessionsDirectory(input: ResolveGrokSessionsDirectoryInput): string {
	const grokHome = input.grokHome?.trim();
	const root = grokHome ? grokHome : input.join(input.homeDirectory, ".grok");
	return input.join(root, "sessions");
}
