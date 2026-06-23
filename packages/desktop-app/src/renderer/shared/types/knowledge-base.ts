export interface KnowledgeNode {
	/** 相对 raws/<kb>/ 的 posix 路径，稳定。 */
	id: string;
	name: string;
	type: "directory" | "file";
	children?: KnowledgeNode[];
	size?: number;
	/** 本地绝对路径（文件，供全局预览）。 */
	sourcePath?: string;
}

export interface KnowledgeBase {
	/** = 顶层目录名。 */
	id: string;
	name: string;
	updatedAt: number;
	/** 默认「个人知识库」：不可删除 / 重命名。 */
	isDefault: boolean;
	nodes: KnowledgeNode[];
}

/** 待导入草稿：选中/拖入的磁盘路径，确认后平铺复制进目标库。 */
export interface KnowledgeImportDraft {
	/** 待导入的磁盘绝对路径。createOnly 时为空。 */
	sourcePaths: string[];
	/** 触发时的活动库 id（drop/pick 预选目标）。 */
	defaultTargetId: string | null;
	/** 仅创建知识库、不带文件的入口。 */
	createOnly?: boolean;
}
