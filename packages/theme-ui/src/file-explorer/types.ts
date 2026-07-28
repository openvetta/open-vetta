/** Plain filesystem entry for tree UI (no desktop store dependency). */
export interface FileExplorerEntry {
	name: string;
	path: string;
	isDirectory: boolean;
	size: number;
	modifiedAt: number;
}
