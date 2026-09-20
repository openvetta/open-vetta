import { statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	type ExternalSessionToolId,
	resolveExternalSessionDirectory,
	resolveGrokSessionsDirectory,
} from "@vetta/coding-agent/external-sessions";

export interface GrokSessionsDirectoryDetection {
	/** Absolute path to the Grok sessions root, if that directory exists. */
	readonly path?: string;
}

export interface DetectGrokSessionsDirectoryOptions {
	readonly grokHome?: string;
	readonly homeDirectory?: string;
	readonly exists?: (path: string) => boolean;
}

function isExistingDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

/** Resolve the well-known Grok sessions root and report it only when the directory exists. */
export function detectGrokSessionsDirectory(
	options: DetectGrokSessionsDirectoryOptions = {},
): GrokSessionsDirectoryDetection {
	const path = resolveGrokSessionsDirectory({
		grokHome: options.grokHome ?? process.env.GROK_HOME,
		homeDirectory: options.homeDirectory ?? homedir(),
		join,
	});
	const exists = options.exists ?? isExistingDirectory;
	return exists(path) ? { path } : {};
}

export function detectExternalSessionDirectory(
	tool: ExternalSessionToolId,
	options: {
		readonly homeDirectory?: string;
		readonly exists?: (path: string) => boolean;
	} = {},
): string | undefined {
	if (tool === "grok") return detectGrokSessionsDirectory(options).path;
	const path = resolveExternalSessionDirectory(tool, {
		homeDirectory: options.homeDirectory ?? homedir(),
		grokHome: process.env.GROK_HOME,
		claudeConfigDir: process.env.CLAUDE_CONFIG_DIR,
		codexHome: process.env.CODEX_HOME,
		cursorHome: process.env.CURSOR_HOME,
		piHome: process.env.PI_HOME,
		ompHome: process.env.OMP_HOME,
		join,
	});
	const exists = options.exists ?? isExistingDirectory;
	return exists(path) ? path : undefined;
}
