/** Node-free file operations needed by the read-only external session catalog. */
export interface ExternalSessionFileHost {
	join(...parts: readonly string[]): string;
	exists(path: string): boolean;
}
