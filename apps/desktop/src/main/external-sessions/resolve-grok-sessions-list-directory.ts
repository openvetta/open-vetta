import { statSync } from "node:fs";
import { resolve } from "node:path";
import { readConfigSync } from "../config/desktop-config-store.js";
import { detectExternalSessionDirectory } from "./detect-external-session-directories.js";
import { detectGrokSessionsDirectory } from "./grok-session-locator.js";
import {
	isSessionImportToolEnabled,
	SESSION_IMPORT_TOOLS,
	type SessionImportToolId,
	sessionImportManualDirectory,
} from "./session-import-tools.js";

export interface DesktopExternalSessionRoot {
	readonly tool: SessionImportToolId;
	readonly path: string;
}

/** Enabled Grok sessions root for listing. Missing or disabled import yields nothing. */
export function resolveGrokSessionsListDirectory(): string | undefined {
	return resolveExternalSessionRoots().find((root) => root.tool === "grok")?.path;
}

/** Enabled external session roots. Used by the catalog host. */
export function resolveExternalSessionRoots(): DesktopExternalSessionRoot[] {
	const config = readConfigSync().sessionImport;
	const roots: DesktopExternalSessionRoot[] = [];
	for (const tool of SESSION_IMPORT_TOOLS) {
		if (!isSessionImportToolEnabled(config, tool.id)) continue;
		const path = usableDirectory(detectDirectory(tool.id) ?? sessionImportManualDirectory(config, tool.id));
		if (path) roots.push({ tool: tool.id, path });
	}
	return roots;
}

/** First enabled root, used as the sidebar list cwd. */
export function resolveExternalSessionsListDirectory(): string | undefined {
	return resolveExternalSessionRoots()[0]?.path;
}

/** True for any enabled tool's detected or manual root so those paths are not authorized as Vetta projects. */
export function isExternalSessionsListDirectory(cwd: string): boolean {
	return isGrokSessionsListDirectory(cwd);
}

/** True for the detected or manual Grok root so neither path is authorized as a Vetta project. */
export function isGrokSessionsListDirectory(cwd: string): boolean {
	const config = readConfigSync().sessionImport;
	const resolved = resolve(cwd);
	return SESSION_IMPORT_TOOLS.some((tool) => {
		if (!isSessionImportToolEnabled(config, tool.id)) return false;
		return listCandidates(tool.id, sessionImportManualDirectory(config, tool.id)).some(
			(path) => resolve(path) === resolved,
		);
	});
}

function detectDirectory(tool: SessionImportToolId): string | undefined {
	if (tool === "grok") return detectGrokSessionsDirectory().path;
	return detectExternalSessionDirectory(tool);
}

function listCandidates(tool: SessionImportToolId, manualPath: string | undefined): string[] {
	return [detectDirectory(tool), manualPath].filter((path): path is string => Boolean(path));
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
