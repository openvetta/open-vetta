export interface AchievementUsageStats {
	activeDayStreak: number;
	automationRuns: number;
	batchRuns: number;
	foregroundActiveMs: number;
	interactiveSessions: number;
	knowledgeBaseCount: number;
	knowledgeBaseFileOperations: number;
	longestConversationMessages: number;
	longestConversationTurns: number;
	messages: number;
	projectsCreated: number;
	todayActiveMs: number;
	todayMessages: number;
	toolsCompleted: number;
	totalTokens: number;
	turns: number;
}

export interface DesktopAppMonitorApi {
	getAchievementUsage(): Promise<AchievementUsageStats>;
}
