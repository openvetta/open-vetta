import type { FsEntry } from "@shared/store/atoms";
import { FileTreeNode } from "./FileTreeNode";

interface FileTreeProps {
	rootDir: string;
	cache: Map<string, FsEntry[]>;
	expandedDirs: Set<string>;
	loadingDirs: Set<string>;
	onToggleDir: (path: string) => void;
	onRename: (oldPath: string, newName: string) => Promise<void>;
}

interface FlatNode {
	entry: FsEntry;
	depth: number;
}

function buildFlatList(
	rootDir: string,
	cache: Map<string, FsEntry[]>,
	expandedDirs: Set<string>,
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

export function FileTree({
	rootDir,
	cache,
	expandedDirs,
	loadingDirs,
	onToggleDir,
	onRename,
}: FileTreeProps): JSX.Element {
	const flatList = buildFlatList(rootDir, cache, expandedDirs);

	if (flatList.length === 0 && !loadingDirs.has(rootDir)) {
		return (
			<div className="px-4 py-6 text-center text-[11px] text-[var(--text-2)]">
				此文件夹为空
			</div>
		);
	}

	return (
		<div role="tree" className="py-0.5">
			{flatList.map((node) => (
				<FileTreeNode
					key={node.entry.path}
					entry={node.entry}
					depth={node.depth}
					isExpanded={expandedDirs.has(node.entry.path)}
					isLoading={loadingDirs.has(node.entry.path)}
					onToggleDir={onToggleDir}
					onRename={onRename}
				/>
			))}
		</div>
	);
}
