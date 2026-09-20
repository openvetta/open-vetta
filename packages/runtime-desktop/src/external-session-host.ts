import { existsSync, readFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { ExternalSessionFileHost, ExternalSessionRoot } from "@vetta/coding-agent/external-sessions";
import { GROK_TOOL_ID } from "@vetta/coding-agent/external-sessions";
import { readPrefixLinesSync } from "./read-prefix-lines.js";

export interface DesktopExternalSessionHostOptions {
	readonly resolveSessionRoots?: () => readonly ExternalSessionRoot[];
	readonly resolveSessionsDirectory?: () => string | undefined;
}

export function createDesktopExternalSessionHost(options: DesktopExternalSessionHostOptions): ExternalSessionFileHost {
	const resolveSessionRoots = (): readonly ExternalSessionRoot[] => {
		if (options.resolveSessionRoots) return options.resolveSessionRoots();
		const path = options.resolveSessionsDirectory?.();
		return path ? [{ tool: GROK_TOOL_ID, path }] : [];
	};
	return {
		resolveSessionRoots,
		join: (...parts) => join(...parts),
		basename,
		exists: existsSync,
		readText: (path) => readFileSync(path, "utf8"),
		readPrefixLines(path, maxLines) {
			return readPrefixLinesSync(path, maxLines);
		},

		async readDirectory(path) {
			return (await readdir(path, { withFileTypes: true })).map((entry) => ({
				name: entry.name,
				kind: entry.isFile()
					? ("file" as const)
					: entry.isDirectory()
						? ("directory" as const)
						: ("other" as const),
			}));
		},
		statModifiedAt: async (path) => (await stat(path)).mtimeMs,
		statFile: async (path) => {
			const info = await stat(path);
			return { mtimeMs: info.mtimeMs, size: info.size };
		},
		samePath: (left, right) => resolve(left) === resolve(right),
		// Stale dist catalogs still call this; keep until coding-agent dist is rebuilt.
		resolveSessionsDirectory: () =>
			options.resolveSessionsDirectory?.() ?? resolveSessionRoots().find((root) => root.tool === GROK_TOOL_ID)?.path,
	} as ExternalSessionFileHost;
}
