export interface AchievementUsageStats {
	automationRuns: number;
	batchRuns: number;
	foregroundActiveMs: number;
	interactiveSessions: number;
	messages: number;
	toolsCompleted: number;
	totalTokens: number;
	turns: number;
}

export interface DesktopAppMonitorApi {
	getAchievementUsage(): Promise<AchievementUsageStats>;
}
