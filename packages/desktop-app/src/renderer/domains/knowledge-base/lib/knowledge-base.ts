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

/** 「待加工文件」平铺项：相对 raws/<kb>/ 的路径 id、文件名、所在相对目录（根为空串）。 */
export interface UnprocessedFile {
	id: string;
	name: string;
	dir: string;
}

/**
 * 递归收集未加工文件（平铺），按 id（≈ source_path）排序，使同目录文件相邻。
 * @param isUnprocessed 据 node.id 判定是否未加工（仅显式 "unprocessed"，避免加工态未加载时全部误判）。
 */
export function collectUnprocessedFiles(
	nodes: KnowledgeNode[],
	isUnprocessed: (id: string) => boolean,
): UnprocessedFile[] {
	const out: UnprocessedFile[] = [];
	const walk = (list: KnowledgeNode[]): void => {
		for (const node of list) {
			if (node.type === "directory") {
				walk(node.children ?? []);
				continue;
			}
			if (isUnprocessed(node.id)) {
				const segments = node.id.split("/");
				out.push({ id: node.id, name: node.name, dir: segments.slice(0, -1).join("/") });
			}
		}
	};
	walk(nodes);
	out.sort((a, b) => a.id.localeCompare(b.id));
	return out;
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
