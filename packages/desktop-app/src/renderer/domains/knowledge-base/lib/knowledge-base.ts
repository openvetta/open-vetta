import type { KnowledgeImportItem, KnowledgeNode } from "@shared/types/knowledge-base";

export interface KnowledgeNodeStats {
	files: number;
	directories: number;
}

export function createKnowledgeId(prefix: string): string {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getFileCategory(name: string): string {
	const extension = name.split(".").pop()?.toLowerCase() ?? "";
	if (["md", "mdx", "txt", "pdf", "doc", "docx"].includes(extension)) return "文档";
	if (["xls", "xlsx", "csv"].includes(extension)) return "表格";
	if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension)) return "图片";
	if (["ts", "tsx", "js", "jsx", "py", "go", "rs", "java"].includes(extension)) return "代码";
	return "其他";
}

function getSuggestedGroup(item: KnowledgeImportItem): string {
	const relativeParts = item.relativePath.split(/[\\/]/).filter(Boolean);
	if (relativeParts.length > 1) return relativeParts[0] ?? "其他";
	if (item.isDirectory) return item.name;
	return getFileCategory(item.name);
}

export function buildSuggestedTree(items: KnowledgeImportItem[]): KnowledgeNode[] {
	const groups = new Map<string, KnowledgeNode[]>();
	for (const item of items) {
		const groupName = getSuggestedGroup(item);
		const children = groups.get(groupName) ?? [];
		children.push({
			id: createKnowledgeId("node"),
			name: item.name,
			type: item.isDirectory ? "directory" : "file",
			children: item.isDirectory ? [] : undefined,
			size: item.size,
			sourcePath: item.path,
		});
		groups.set(groupName, children);
	}

	return Array.from(groups, ([name, children]) => ({
		id: createKnowledgeId("dir"),
		name,
		type: "directory" as const,
		children,
	}));
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
	const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60_000));
	if (minutes < 60) return `${minutes} 分钟前更新`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} 小时前更新`;
	return `${Math.round(hours / 24)} 天前更新`;
}
