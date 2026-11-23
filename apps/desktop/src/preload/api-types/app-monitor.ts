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

export type AppMonitorInputAttachmentSource = "at-panel" | "file-dialog" | "image-dialog" | "drop" | "paste";

export interface AppMonitorInputFileAttachment {
	extension: string;
	isDirectory: boolean;
	sizeBytes?: number;
}

export interface AppMonitorInputImageAttachment {
	format: string;
	sizeBytes?: number;
	width?: number;
	height?: number;
}

export type AppMonitorInputActionKind = "builtin" | "plugin";

export interface AppMonitorInputActionUsage {
	actionId: string;
	actionKind: AppMonitorInputActionKind;
}

export type AppMonitorInputPromptRefKind = "skill";

export interface AppMonitorInputPromptRefUsage {
	kind: AppMonitorInputPromptRefKind;
	name: string;
}

export type AppMonitorResourceKind = "skill" | "plugin" | "mcp";

export type AppMonitorResourceOperation =
	| "installed"
	| "updated"
	| "imported"
	| "uninstalled"
	| "enabled"
	| "disabled"
	| "reloaded"
	| "permissions-granted"
	| "permissions-revoked"
	| "commands-granted"
	| "commands-revoked";

export type AppMonitorResourceSource = "market" | "custom" | "archive" | "remote" | "npm" | "system";

export type AppMonitorSettingsTab =
	| "general"
	| "appearance"
	| "account"
	| "agent"
	| "models"
	| "mcp"
	| "im"
	| "webhook"
	| "shortcuts"
	| "appshot"
	| "environment"
	| "permissions"
	| "knowledge"
	| "pet"
	| "plugins"
	| "archived"
	| "subscription"
	| "newSession";

export type AppMonitorSettingsAction =
	| "selected"
	| "changed"
	| "saved"
	| "added"
	| "updated"
	| "deleted"
	| "enabled"
	| "disabled"
	| "reset"
	| "restored"
	| "tested"
	| "scanned"
	| "retried"
	| "cleared"
	| "imported"
	| "reinstalled"
	| "refreshed";

export type AppMonitorEvent =
	| {
			type: "input.attachments.added";
			source: AppMonitorInputAttachmentSource;
			files?: AppMonitorInputFileAttachment[];
			images?: AppMonitorInputImageAttachment[];
	  }
	| {
			type: "input.action.toggled";
			actionId: string;
			actionKind: AppMonitorInputActionKind;
			active: boolean;
	  }
	| {
			type: "input.action.used";
			actions: AppMonitorInputActionUsage[];
	  }
	| {
			type: "input.context.used";
			files?: AppMonitorInputFileAttachment[];
			images?: AppMonitorInputImageAttachment[];
			promptRef?: AppMonitorInputPromptRefUsage;
	  }
	| {
			type: "resource.lifecycle";
			resourceKind: AppMonitorResourceKind;
			operation: AppMonitorResourceOperation;
			resourceId: string;
			source?: AppMonitorResourceSource;
			system?: boolean;
			permissionCount?: number;
			commandCount?: number;
	  }
	| {
			type: "settings.changed";
			tab: AppMonitorSettingsTab;
			action: AppMonitorSettingsAction;
			target: string;
			value?: string;
	  };

/** 单个 skill / 场景的历史使用情况。 */
export interface AppMonitorPromptRefUsage {
	used: number;
	lastUsedAt: number;
}

/**
 * 按 `kind:name` 归集的使用统计。key 里的 name 经过归一化（小写 + 截断），
 * 调用方比对时必须同样小写化。
 */
export type AppMonitorPromptRefUsageMap = Record<string, AppMonitorPromptRefUsage>;

export interface UsageTokenTotals {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	costTotal: number;
	/** 完成的模型调用次数；按模型统计上线前的记录没有这一项，记为 0。 */
	requests: number;
}

/**
 * 用量报表里一行「模型」的来源：
 * - `model`：带 provider / model 的真实模型；
 * - `unknown`：运行时没有报告模型的调用；
 * - `unattributed`：按模型统计上线前的历史，只有总数；
 * - `knowledgeBase`：知识库加工的模型调用，单独计数。
 */
export type UsageReportSeriesKind = "model" | "unknown" | "unattributed" | "knowledgeBase";

export interface UsageReportSeries {
	key: string;
	kind: UsageReportSeriesKind;
	provider: string;
	model: string;
}

export interface UsageReportDay {
	/** 报表时区下的 `YYYY-MM-DD`。 */
	day: string;
	totals: UsageTokenTotals;
	/** key 对应 `UsageReport.series[].key`。 */
	bySeries: Record<string, UsageTokenTotals>;
	/** 当天每小时的 token 数；按小时统计上线前的日期为 null。 */
	hourlyTokens: number[] | null;
}

export interface UsageReport {
	timeZone: string;
	/** 报表时区下的今天。 */
	today: string;
	series: UsageReportSeries[];
	/** 只含有记录的日期，按日期升序。 */
	days: UsageReportDay[];
}

export interface DesktopAppMonitorApi {
	getAchievementUsage(): Promise<AchievementUsageStats>;
	/** 设置页「用量」：所有已落盘月份的按天 token 汇总。 */
	getUsageReport(): Promise<UsageReport>;
	/** 命令面板按使用频次排序用；读的是已落盘的 inputPromptRefs.byRef。 */
	getPromptRefUsage(): Promise<AppMonitorPromptRefUsageMap>;
	recordEvent(event: AppMonitorEvent): void;
}
