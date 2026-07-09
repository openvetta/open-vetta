import { ipcMain } from "electron";
import { getAppMonitorSnapshot, recordAppMonitorUserActivity } from "../app-monitor/app-monitor-service.js";

const USER_ACTIVITY_CHANNEL = "vetta:app-monitor:user-activity";
const GET_ACHIEVEMENT_USAGE_CHANNEL = "vetta:app-monitor:get-achievement-usage";

export function registerAppMonitorIpc(): () => void {
	const onUserActivity = (): void => {
		recordAppMonitorUserActivity();
	};
	ipcMain.on(USER_ACTIVITY_CHANNEL, onUserActivity);
	ipcMain.handle(GET_ACHIEVEMENT_USAGE_CHANNEL, () => {
		const snapshot = getAppMonitorSnapshot();
		return {
			activeDayStreak: snapshot.engagement.activeDayStreak,
			automationRuns: snapshot.automationTasks.runsStarted,
			batchRuns: snapshot.batchTasks.runsStarted,
			foregroundActiveMs: snapshot.durations.foregroundActiveMs,
			interactiveSessions: snapshot.sessions.interactive,
			knowledgeBaseCount: snapshot.knowledgeBase.kbCount,
			knowledgeBaseFileOperations: snapshot.knowledgeBase.filesAdded + snapshot.knowledgeBase.filesDeleted,
			longestConversationMessages: snapshot.engagement.longestConversationMessages,
			longestConversationTurns: snapshot.engagement.longestConversationTurns,
			messages: snapshot.sessions.messages,
			projectsCreated: snapshot.batchTasks.projectsCreated,
			todayActiveMs: snapshot.engagement.todayForegroundActiveMs,
			todayMessages: snapshot.engagement.todayMessages,
			toolsCompleted: snapshot.tools.completed,
			totalTokens: snapshot.usage.inputTokens + snapshot.usage.outputTokens,
			turns: snapshot.sessions.turns,
		};
	});
	return () => {
		ipcMain.removeListener(USER_ACTIVITY_CHANNEL, onUserActivity);
		ipcMain.removeHandler(GET_ACHIEVEMENT_USAGE_CHANNEL);
	};
}
