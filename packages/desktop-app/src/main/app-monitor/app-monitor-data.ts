export const APP_MONITOR_SCHEMA_VERSION = 1;

export interface AppMonitorToolStats {
	started: number;
	completed: number;
	failed: number;
	totalDurationMs: number;
}

export interface AppMonitorData {
	schemaVersion: typeof APP_MONITOR_SCHEMA_VERSION;
	createdAt: number;
	updatedAt: number;
	durations: {
		foregroundActiveMs: number;
		foregroundInactiveMs: number;
		backgroundMs: number;
	};
	sessions: {
		interactive: number;
		batch: number;
		automation: number;
		turns: number;
		messages: number;
	};
	tools: {
		started: number;
		completed: number;
		failed: number;
		totalDurationMs: number;
		byName: Record<string, AppMonitorToolStats>;
	};
	batchTasks: {
		projectsCreated: number;
		runsStarted: number;
	};
	automationTasks: {
		tasksCreated: number;
		runsStarted: number;
	};
	usage: {
		inputTokens: number;
		outputTokens: number;
		cacheReadTokens: number;
		cacheWriteTokens: number;
		costTotal: number;
	};
	compactions: {
		started: number;
		succeeded: number;
		failed: number;
	};
	errors: {
		runtime: number;
		provider: number;
		tool: number;
		mcp: number;
	};
	engagement: {
		currentDay: string;
		lastActiveDay: string;
		activeDayStreak: number;
		todayForegroundActiveMs: number;
		todayMessages: number;
		longestConversationTurns: number;
		longestConversationMessages: number;
	};
	knowledgeBase: {
		processingInputTokens: number;
		processingOutputTokens: number;
		processingCacheReadTokens: number;
		processingCacheWriteTokens: number;
		processingCostTotal: number;
		processingRounds: number;
		filesProcessed: number;
		filesFailed: number;
		kbCount: number;
		totalSourceFiles: number;
		wikiPageCount: number;
		manualScanCount: number;
		retryFailedCount: number;
		clearWikiCount: number;
		filesAdded: number;
		filesDeleted: number;
	};
}

function normalizeCount(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function normalizeAmount(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function normalizeDayKey(value: unknown): string {
	return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function normalizeToolName(value: unknown): string {
	if (typeof value !== "string") return "";
	const trimmed = value.trim();
	if (trimmed === "" || trimmed === "__proto__" || trimmed === "prototype" || trimmed === "constructor") return "";
	return trimmed.slice(0, 128);
}

function normalizeToolStats(value: unknown): AppMonitorToolStats {
	const stats = asRecord(value);
	return {
		started: normalizeCount(stats.started),
		completed: normalizeCount(stats.completed),
		failed: normalizeCount(stats.failed),
		totalDurationMs: normalizeCount(stats.totalDurationMs),
	};
}

function normalizeToolStatsByName(value: unknown): Record<string, AppMonitorToolStats> {
	const statsByName: Record<string, AppMonitorToolStats> = {};
	for (const [rawName, rawStats] of Object.entries(asRecord(value))) {
		const toolName = normalizeToolName(rawName);
		if (toolName === "") continue;
		statsByName[toolName] = normalizeToolStats(rawStats);
	}
	return statsByName;
}

function formatLocalDayKey(timestamp: number): string {
	const date = new Date(timestamp);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function createDefaultAppMonitorData(now = Date.now()): AppMonitorData {
	const currentDay = formatLocalDayKey(now);
	return {
		schemaVersion: APP_MONITOR_SCHEMA_VERSION,
		createdAt: now,
		updatedAt: now,
		durations: {
			foregroundActiveMs: 0,
			foregroundInactiveMs: 0,
			backgroundMs: 0,
		},
		sessions: {
			interactive: 0,
			batch: 0,
			automation: 0,
			turns: 0,
			messages: 0,
		},
		tools: {
			started: 0,
			completed: 0,
			failed: 0,
			totalDurationMs: 0,
			byName: {},
		},
		batchTasks: {
			projectsCreated: 0,
			runsStarted: 0,
		},
		automationTasks: {
			tasksCreated: 0,
			runsStarted: 0,
		},
		usage: {
			inputTokens: 0,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
			costTotal: 0,
		},
		compactions: {
			started: 0,
			succeeded: 0,
			failed: 0,
		},
		errors: {
			runtime: 0,
			provider: 0,
			tool: 0,
			mcp: 0,
		},
		engagement: {
			currentDay,
			lastActiveDay: "",
			activeDayStreak: 0,
			todayForegroundActiveMs: 0,
			todayMessages: 0,
			longestConversationTurns: 0,
			longestConversationMessages: 0,
		},
		knowledgeBase: {
			processingInputTokens: 0,
			processingOutputTokens: 0,
			processingCacheReadTokens: 0,
			processingCacheWriteTokens: 0,
			processingCostTotal: 0,
			processingRounds: 0,
			filesProcessed: 0,
			filesFailed: 0,
			kbCount: 0,
			totalSourceFiles: 0,
			wikiPageCount: 0,
			manualScanCount: 0,
			retryFailedCount: 0,
			clearWikiCount: 0,
			filesAdded: 0,
			filesDeleted: 0,
		},
	};
}

export function normalizeAppMonitorData(value: unknown): AppMonitorData {
	const data = asRecord(value);
	const defaults = createDefaultAppMonitorData();
	const durations = asRecord(data.durations);
	const sessions = asRecord(data.sessions);
	const tools = asRecord(data.tools);
	const batchTasks = asRecord(data.batchTasks);
	const automationTasks = asRecord(data.automationTasks);
	const usage = asRecord(data.usage);
	const compactions = asRecord(data.compactions);
	const errors = asRecord(data.errors);
	const engagement = asRecord(data.engagement);
	const knowledgeBase = asRecord(data.knowledgeBase);

	return {
		schemaVersion: APP_MONITOR_SCHEMA_VERSION,
		createdAt: normalizeCount(data.createdAt) || defaults.createdAt,
		updatedAt: normalizeCount(data.updatedAt) || defaults.updatedAt,
		durations: {
			foregroundActiveMs: normalizeCount(durations.foregroundActiveMs),
			foregroundInactiveMs: normalizeCount(durations.foregroundInactiveMs),
			backgroundMs: normalizeCount(durations.backgroundMs),
		},
		sessions: {
			interactive: normalizeCount(sessions.interactive),
			batch: normalizeCount(sessions.batch),
			automation: normalizeCount(sessions.automation),
			turns: normalizeCount(sessions.turns),
			messages: normalizeCount(sessions.messages),
		},
		tools: {
			started: normalizeCount(tools.started),
			completed: normalizeCount(tools.completed),
			failed: normalizeCount(tools.failed),
			totalDurationMs: normalizeCount(tools.totalDurationMs),
			byName: normalizeToolStatsByName(tools.byName),
		},
		batchTasks: {
			projectsCreated: normalizeCount(batchTasks.projectsCreated),
			runsStarted: normalizeCount(batchTasks.runsStarted),
		},
		automationTasks: {
			tasksCreated: normalizeCount(automationTasks.tasksCreated),
			runsStarted: normalizeCount(automationTasks.runsStarted),
		},
		usage: {
			inputTokens: normalizeCount(usage.inputTokens),
			outputTokens: normalizeCount(usage.outputTokens),
			cacheReadTokens: normalizeCount(usage.cacheReadTokens),
			cacheWriteTokens: normalizeCount(usage.cacheWriteTokens),
			costTotal: normalizeAmount(usage.costTotal),
		},
		compactions: {
			started: normalizeCount(compactions.started),
			succeeded: normalizeCount(compactions.succeeded),
			failed: normalizeCount(compactions.failed),
		},
		errors: {
			runtime: normalizeCount(errors.runtime),
			provider: normalizeCount(errors.provider),
			tool: normalizeCount(errors.tool),
			mcp: normalizeCount(errors.mcp),
		},
		engagement: {
			currentDay: normalizeDayKey(engagement.currentDay) || defaults.engagement.currentDay,
			lastActiveDay: normalizeDayKey(engagement.lastActiveDay),
			activeDayStreak: normalizeCount(engagement.activeDayStreak),
			todayForegroundActiveMs: normalizeCount(engagement.todayForegroundActiveMs),
			todayMessages: normalizeCount(engagement.todayMessages),
			longestConversationTurns: normalizeCount(engagement.longestConversationTurns),
			longestConversationMessages: normalizeCount(engagement.longestConversationMessages),
		},
		knowledgeBase: {
			processingInputTokens: normalizeCount(knowledgeBase.processingInputTokens),
			processingOutputTokens: normalizeCount(knowledgeBase.processingOutputTokens),
			processingCacheReadTokens: normalizeCount(knowledgeBase.processingCacheReadTokens),
			processingCacheWriteTokens: normalizeCount(knowledgeBase.processingCacheWriteTokens),
			processingCostTotal: normalizeAmount(knowledgeBase.processingCostTotal),
			processingRounds: normalizeCount(knowledgeBase.processingRounds),
			filesProcessed: normalizeCount(knowledgeBase.filesProcessed),
			filesFailed: normalizeCount(knowledgeBase.filesFailed),
			kbCount: normalizeCount(knowledgeBase.kbCount),
			totalSourceFiles: normalizeCount(knowledgeBase.totalSourceFiles),
			wikiPageCount: normalizeCount(knowledgeBase.wikiPageCount),
			manualScanCount: normalizeCount(knowledgeBase.manualScanCount),
			retryFailedCount: normalizeCount(knowledgeBase.retryFailedCount),
			clearWikiCount: normalizeCount(knowledgeBase.clearWikiCount),
			filesAdded: normalizeCount(knowledgeBase.filesAdded),
			filesDeleted: normalizeCount(knowledgeBase.filesDeleted),
		},
	};
}
