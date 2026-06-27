import { i18n } from "@shared/i18n";
import type { KnowledgeBase, KnowledgeNode } from "@shared/types/knowledge-base";

/** 默认库的磁盘名是语言无关的 "default_kb"，UI 显示走 i18n；其余库用磁盘原名。 */
export function knowledgeBaseDisplayName(base: Pick<KnowledgeBase, "name" | "isDefault">): string {
	return base.isDefault ? i18n.t("settings:kbDefaultName") : base.name;
}

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
	if (minutes < 60) return i18n.t("settings:kbUpdatedMinutes", { n: minutes });
	const hours = Math.round(minutes / 60);
	if (hours < 24) return i18n.t("settings:kbUpdatedHours", { n: hours });
	return i18n.t("settings:kbUpdatedDays", { n: Math.round(hours / 24) });
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
