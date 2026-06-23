import type { KnowledgeNode } from "@shared/types/knowledge-base";

export interface KnowledgeNodeStats {
	files: number;
	directories: number;
}

export function countKnowledgeNodes(nodes: KnowledgeNode[]): KnowledgeNodeStats {
	let files = 0;
	let directories = 0;
	for (const node of nodes) {
		if (node.type === "file") {
			files += 1;
			continue;
		}
		directories += 1;
		const nested = countKnowledgeNodes(node.children ?? []);
		files += nested.files;
		directories += nested.directories;
	}
	return { files, directories };
}

export function knowledgeNodeMatches(node: KnowledgeNode, normalizedQuery: string): boolean {
	if (node.name.toLocaleLowerCase().includes(normalizedQuery)) return true;
	return node.children?.some((child) => knowledgeNodeMatches(child, normalizedQuery)) ?? false;
}

export function formatKnowledgeUpdatedAt(timestamp: number): string {
	if (!timestamp) return "";
	const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60_000));
	if (minutes < 60) return `${minutes} 分钟前更新`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} 小时前更新`;
	return `${Math.round(hours / 24)} 天前更新`;
}

/** 按面包屑路径段定位到某层目录的子节点列表；越界返回空。 */
export function nodesAtPath(rootNodes: KnowledgeNode[], path: string[]): KnowledgeNode[] {
	let current = rootNodes;
	for (const segment of path) {
		const dir = current.find((node) => node.type === "directory" && node.name === segment);
		if (!dir) return [];
		current = dir.children ?? [];
	}
	return current;
}
