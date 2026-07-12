import type { JSX } from "react";
import { FileTreeNodeView } from "./FileTreeNodeView";
import type { FileExplorerEntry } from "./types";

export interface FileTreeViewProps {
	rootDir: string;
	/** dir path → children */
	cache: ReadonlyMap<string, readonly FileExplorerEntry[]>;
	expandedDirs: ReadonlySet<string>;
	loadingDirs: ReadonlySet<string>;
	selectedPath: string | null;
	renamingPath: string | null;
	emptyLabel: string;
	onToggleDir: (path: string) => void;
	onSelectFile: (entry: FileExplorerEntry) => void;
	onContextMenu: (entry: FileExplorerEntry, x: number, y: number) => void;
	onRenameSubmit: (oldPath: string, newName: string) => void;
	onRenameCancel: () => void;
	onFileMove: (srcPath: string, destDir: string) => void;
}

interface FlatNode {
	entry: FileExplorerEntry;
	depth: number;
}

function buildFlatList(
	rootDir: string,
	cache: ReadonlyMap<string, readonly FileExplorerEntry[]>,
	expandedDirs: ReadonlySet<string>,
): FlatNode[] {
	const result: FlatNode[] = [];

	function walk(dirPath: string, depth: number) {
		const entries = cache.get(dirPath);
		if (!entries) return;
		for (const entry of entries) {
			result.push({ entry, depth });
			if (entry.isDirectory && expandedDirs.has(entry.path)) {
				walk(entry.path, depth + 1);
			}
		}
	}

	walk(rootDir, 0);
	return result;
}

/**
 * Flattened file tree. Host owns cache / expand / rename path atoms.
 */
export function FileTreeView({
	rootDir,
	cache,
	expandedDirs,
	loadingDirs,
	selectedPath,
	renamingPath,
	emptyLabel,
	onToggleDir,
	onSelectFile,
	onContextMenu,
	onRenameSubmit,
	onRenameCancel,
	onFileMove,
}: FileTreeViewProps): JSX.Element {
	const flatList = buildFlatList(rootDir, cache, expandedDirs);

	if (flatList.length === 0 && !loadingDirs.has(rootDir)) {
		return (
			<div className="px-4 py-6 text-center text-[11px] text-muted-foreground">{emptyLabel}</div>
		);
	}

	return (
		<div role="tree" className="py-0.5">
			{flatList.map((node) => (
				<FileTreeNodeView
					key={node.entry.path}
					entry={node.entry}
					depth={node.depth}
					isExpanded={expandedDirs.has(node.entry.path)}
					isLoading={loadingDirs.has(node.entry.path)}
					isSelected={selectedPath === node.entry.path}
					isRenaming={renamingPath === node.entry.path}
					onToggleDir={onToggleDir}
					onSelectFile={onSelectFile}
					onContextMenu={onContextMenu}
					onRenameSubmit={onRenameSubmit}
					onRenameCancel={onRenameCancel}
					onFileMove={onFileMove}
				/>
			))}
		</div>
	);
}
