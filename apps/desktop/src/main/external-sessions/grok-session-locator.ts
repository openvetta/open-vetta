import { statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveGrokSessionsDirectory } from "@vetta/coding-agent/external-sessions";

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
