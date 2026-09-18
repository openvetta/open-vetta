import { existsSync, readFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { ExternalSessionFileHost } from "@vetta/coding-agent/external-sessions";

export interface DesktopExternalSessionHostOptions {
	readonly resolveSessionsDirectory: () => string | undefined;
}

export function createDesktopExternalSessionHost(options: DesktopExternalSessionHostOptions): ExternalSessionFileHost {
	return {
		resolveSessionsDirectory: options.resolveSessionsDirectory,
		join: (...parts) => join(...parts),
		basename,
		exists: existsSync,
		readText: (path) => readFileSync(path, "utf8"),
		readPrefixLines(path, maxLines) {
			return readFileSync(path, "utf8").split(/\r?\n/).slice(0, maxLines).join("\n");
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
	};
}
