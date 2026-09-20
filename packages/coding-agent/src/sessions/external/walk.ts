import type { ExternalSessionDirectoryEntry, ExternalSessionFileHost } from "./host-contracts.js";

export async function collectFiles(
	host: ExternalSessionFileHost,
	root: string,
	options: {
		readonly maxDepth: number;
		readonly enter?: (name: string, path: string) => boolean;
		readonly include: (name: string, path: string) => boolean;
		readonly matches?: (path: string) => boolean;
	},
): Promise<string[]> {
	if (!host.exists(root)) return [];
	const files: string[] = [];
	await visit(host, root, 0, options, files);
	return options.matches ? files.filter(options.matches) : files;
}

async function visit(
	host: ExternalSessionFileHost,
	directory: string,
	depth: number,
	options: {
		readonly maxDepth: number;
		readonly enter?: (name: string, path: string) => boolean;
		readonly include: (name: string, path: string) => boolean;
	},
	files: string[],
): Promise<void> {
	let entries: readonly ExternalSessionDirectoryEntry[];
	try {
		entries = await host.readDirectory(directory);
	} catch {
		return;
	}
	for (const entry of entries) {
		const path = host.join(directory, entry.name);
		if (entry.kind === "file" && options.include(entry.name, path)) files.push(path);
		if (entry.kind === "directory" && depth < options.maxDepth && (options.enter?.(entry.name, path) ?? true)) {
			await visit(host, path, depth + 1, options, files);
		}
	}
}
