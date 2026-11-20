import type { StatusGroups } from "./types";

/** 提交被什么挡住了；`null` 表示可以提交（消息另算）。 */
export type CommitBlockedReason = "conflict" | "empty" | null;

export interface CommitPlan {
	/** 索引为空、工作区有改动：主按钮直接全暂存再提交，而不是灰着让人不知道下一步。 */
	stageAll: boolean;
	blocked: CommitBlockedReason;
	canCommit: boolean;
}

/**
 * 「这次点提交会发生什么」的唯一判断点。面板里的提交框与顶栏气泡共用它，
 * 免得两个入口对「有没有东西可提交」「要不要顺手全暂存」给出不同答案。
 */
export function planCommit(groups: StatusGroups, message: string): CommitPlan {
	const blocked: CommitBlockedReason =
		groups.conflict.length > 0 ? "conflict" : groups.staged.length + groups.unstaged.length === 0 ? "empty" : null;
	const stageAll = groups.staged.length === 0 && groups.unstaged.length > 0;
	return { stageAll, blocked, canCommit: blocked === null && message.trim().length > 0 };
}
