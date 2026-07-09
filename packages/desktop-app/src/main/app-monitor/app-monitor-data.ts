export const APP_MONITOR_SCHEMA_VERSION = 1;

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

export function createDefaultAppMonitorData(now = Date.now()): AppMonitorData {
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
