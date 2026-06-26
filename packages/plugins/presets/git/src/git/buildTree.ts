import type { ChangeEntry, TreeNode } from "./types";

function sortNodes(nodes: TreeNode[]): void {
	nodes.sort((a, b) => {
		if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
		return a.name.localeCompare(b.name);
	});
	for (const node of nodes) {
		if (node.isDir) {
			node.hasChangedDescendants = true;
			sortNodes(node.children);
		}
	}
}

/** Build a folder/file tree (top-level nodes) from a flat change list. */
export function buildTree(entries: ChangeEntry[]): TreeNode[] {
	const root: TreeNode = { name: "", path: "", isDir: true, children: [] };
	for (const entry of entries) {
		const segments = entry.path.split("/").filter(Boolean);
		let current = root;
		for (let i = 0; i < segments.length; i++) {
			const segment = segments[i];
			const isLeaf = i === segments.length - 1;
			const nodePath = segments.slice(0, i + 1).join("/");
			if (isLeaf) {
				current.children.push({ name: segment, path: nodePath, isDir: false, entry, children: [] });
				break;
			}
			let dir = current.children.find((child) => child.isDir && child.name === segment);
			if (!dir) {
				dir = { name: segment, path: nodePath, isDir: true, children: [] };
				current.children.push(dir);
			}
			current = dir;
		}
	}
	sortNodes(root.children);
	return root.children;
}
