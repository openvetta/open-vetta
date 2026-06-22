export interface KnowledgeNode {
	id: string;
	name: string;
	type: "directory" | "file";
	children?: KnowledgeNode[];
	size?: number;
	sourcePath?: string;
}

export interface KnowledgeBase {
	id: string;
	name: string;
	description: string;
	updatedAt: number;
	nodes: KnowledgeNode[];
}

export interface KnowledgeImportItem {
	name: string;
	path: string;
	relativePath: string;
	isDirectory: boolean;
	size: number;
}

export interface KnowledgeImportDraft {
	items: KnowledgeImportItem[];
	targetKnowledgeBaseId: string | null;
	source: "drop" | "picker" | "create";
}
