import { CAPABILITY_PREFIXES } from "./contracts.js";

/** Stable prefix for Vetta-owned domain capabilities. Prefixes are never authorization rules. */
export const VETTA_DOMAIN_CAPABILITY_PREFIX = CAPABILITY_PREFIXES.VETTA_DOMAIN;

export {
	DOMAIN_DOWNLOAD_CAPABILITIES,
	DOWNLOAD_STATUSES,
	type DownloadCancelInput,
	type DownloadItem,
	type DownloadStatus,
} from "./domain/download.js";
export {
	DOMAIN_PROJECT_CAPABILITIES,
	type ProjectCreateInput,
	type ProjectEntry,
	type ProjectListResult,
	type ProjectOpenInput,
	type ProjectPathInput,
	type ProjectRenameInput,
} from "./domain/project.js";
export {
	DOMAIN_SCHEDULER_CAPABILITIES,
	SCHEDULER_COMMAND_STATUSES,
	SCHEDULER_EXECUTION_MODES,
	SCHEDULER_LAST_RUN_STATUSES,
	SCHEDULER_RECORD_STATUSES,
	SCHEDULER_SKILL_TYPES,
	type SchedulerCommandResult,
	type SchedulerCommandStatus,
	type SchedulerExecutionMode,
	type SchedulerExecutionRecord,
	type SchedulerLastRunStatus,
	type SchedulerRecordStatus,
	type SchedulerSkillRef,
	type SchedulerSkillType,
	type SchedulerTask,
	type SchedulerTaskCreateData,
	type SchedulerTaskCreateInput,
	type SchedulerTaskIdInput,
	type SchedulerTaskSetEnabledInput,
	type SchedulerTaskUpdateData,
	type SchedulerTaskUpdateInput,
} from "./domain/scheduler.js";
export {
	DOMAIN_SESSION_CAPABILITIES,
	type SessionHistoryEntry,
	type SessionListInput,
	type SessionRuntimeProject,
} from "./domain/session.js";
export {
	DOMAIN_WEBHOOK_CAPABILITIES,
	WEBHOOK_KINDS,
	WEBHOOK_MESSAGE_LEVELS,
	type WebhookCreateData,
	type WebhookCreateInput,
	type WebhookDingtalkOptions,
	type WebhookEndpoint,
	type WebhookFeishuOptions,
	type WebhookIdInput,
	type WebhookKind,
	type WebhookMessage,
	type WebhookMessageLevel,
	type WebhookProviderDescriptor,
	type WebhookSendInput,
	type WebhookSendResult,
	type WebhookSetEnabledInput,
	type WebhookUpdateData,
	type WebhookUpdateInput,
} from "./domain/webhook.js";
