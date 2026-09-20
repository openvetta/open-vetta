import type { ExternalSessionToolId } from "./tool-ids.js";

export interface ResolveExternalSessionDirectoryInput {
	readonly homeDirectory: string;
	readonly grokHome?: string;
	readonly claudeConfigDir?: string;
	readonly codexHome?: string;
	readonly cursorHome?: string;
	readonly piHome?: string;
	readonly ompHome?: string;
	join(...parts: readonly string[]): string;
}

export function resolveExternalSessionDirectory(
	tool: ExternalSessionToolId,
	input: ResolveExternalSessionDirectoryInput,
): string {
	if (tool === "grok") {
		const grokHome = input.grokHome?.trim();
		const root = grokHome ? grokHome : input.join(input.homeDirectory, ".grok");
		return input.join(root, "sessions");
	}
	if (tool === "claude-code") {
		const configDir = input.claudeConfigDir?.trim() || input.join(input.homeDirectory, ".claude");
		return input.join(configDir, "projects");
	}
	if (tool === "codex") {
		const home = input.codexHome?.trim() || input.join(input.homeDirectory, ".codex");
		return input.join(home, "sessions");
	}
	if (tool === "cursor-agent") {
		const home = input.cursorHome?.trim() || input.join(input.homeDirectory, ".cursor");
		return input.join(home, "projects");
	}
	if (tool === "pi") {
		const home = input.piHome?.trim() || input.join(input.homeDirectory, ".pi");
		return input.join(home, "agent", "sessions");
	}
	const home = input.ompHome?.trim() || input.join(input.homeDirectory, ".omp");
	return input.join(home, "agent", "sessions");
}
