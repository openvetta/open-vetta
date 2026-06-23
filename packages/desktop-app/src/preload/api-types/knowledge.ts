export interface DesktopKnowledgeApi {
	/** 立即跑一轮加工（手动触发，不等轮询周期）。返回是否因无变更跳过。 */
	scanNow(): Promise<{ skipped: boolean }>;
	/** 据当前设置重新调度后台轮询器（保存知识库设置后调用）。 */
	reload(): Promise<void>;
}
