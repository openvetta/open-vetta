import { statSync } from "node:fs";
import { resolve } from "node:path";
import { readConfigSync } from "../config/desktop-config-store.js";
import { detectGrokSessionsDirectory } from "./grok-session-locator.js";

/** Enabled Grok sessions root for listing. Missing or disabled import yields nothing. */
export function resolveGrokSessionsListDirectory(): string | undefined {
	const config = readConfigSync();
	if (config.sessionImport?.grokEnabled !== true) return undefined;
	return usableDirectory(detectGrokSessionsDirectory().path ?? config.sessionImport.grokSessionDir);
}

/** True for the detected or manual Grok root so neither path is authorized as a Vetta project. */
export function isGrokSessionsListDirectory(cwd: string): boolean {
	const config = readConfigSync();
	if (config.sessionImport?.grokEnabled !== true) return false;
	const resolved = resolve(cwd);
	return grokListCandidates(config.sessionImport.grokSessionDir).some((path) => resolve(path) === resolved);
}

function grokListCandidates(manualPath: string | undefined): string[] {
	return [detectGrokSessionsDirectory().path, manualPath].filter((path): path is string => Boolean(path));
}

function usableDirectory(path: string | undefined): string | undefined {
	if (!path) return undefined;
	try {
		if (!statSync(path).isDirectory()) return undefined;
	} catch {
		return undefined;
	}
	return resolve(path);
}
