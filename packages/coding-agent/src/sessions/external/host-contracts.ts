export interface ExternalSessionDirectoryEntry {
	readonly name: string;
	readonly kind: "file" | "directory" | "other";
}

export interface ExternalSessionRoot {
	readonly tool: string;
	readonly path: string;
}

/** Node-free file operations needed by the read-only external session catalog. */
export interface ExternalSessionFileHost {
	/** Enabled external session roots. Omit a tool when import is off or the directory is missing. */
	resolveSessionRoots(): readonly ExternalSessionRoot[];
	join(...parts: readonly string[]): string;
	basename(path: string): string;
	exists(path: string): boolean;
	readText(path: string): string;
	readPrefixLines(path: string, maxLines: number): string;
	readDirectory(path: string): Promise<readonly ExternalSessionDirectoryEntry[]>;
	statModifiedAt(path: string): Promise<number>;
	statFile(path: string): Promise<{ readonly mtimeMs: number; readonly size: number }>;
	samePath(left: string, right: string): boolean;
}
