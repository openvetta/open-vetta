import { randomUUID } from "node:crypto";
import { type CapabilityAccessHandle, type CapabilityAccessSessionFactory, createCapabilityGrant } from "../access.js";
import { CAPABILITY_ERROR_CODES, CapabilityError } from "../contracts.js";
import {
	type BatchProject,
	type BatchTaskCommandResult,
	DOMAIN_BATCH_TASK_CAPABILITIES,
	DOMAIN_DOWNLOAD_CAPABILITIES,
	DOMAIN_KNOWLEDGE_CAPABILITIES,
	DOMAIN_PROJECT_CAPABILITIES,
	DOMAIN_SCHEDULER_CAPABILITIES,
	DOMAIN_SESSION_CAPABILITIES,
	DOMAIN_WEBHOOK_CAPABILITIES,
	type DownloadItem,
	type KnowledgeBase,
	type KnowledgeFileStatuses,
	type KnowledgeProcessingSettings,
	type KnowledgeScanResult,
	type ProjectEntry,
	type ProjectListResult,
	type SchedulerCommandResult,
	type SchedulerExecutionRecord,
	type SchedulerTask,
	type SessionHistoryEntry,
	type SessionRuntimeProject,
	type WebhookEndpoint,
	type WebhookProviderDescriptor,
	type WebhookSendResult,
} from "../domain.js";
import {
	type FilesystemEntry,
	type FilesystemFileRef,
	type FilesystemReadFileResult,
	type FilesystemStatResult,
	FOUNDATION_FILESYSTEM_CAPABILITIES,
} from "../foundation.js";

const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export const PLUGIN_CAPABILITY_PERMISSIONS = {
	FILESYSTEM_READ: "fs.read",
	FILESYSTEM_WRITE: "fs.write",
} as const;

export interface PluginCapabilityAdapterOptions {
	readonly isOfficialPlugin: (pluginId: string) => boolean;
	readonly resolvePermissions: (pluginId: string) => readonly string[];
}

interface PluginCapabilitySession {
	readonly access: CapabilityAccessHandle;
	readonly pluginId: string;
}

interface PluginCapabilityRequirement {
	readonly official?: boolean;
	readonly permission?: string;
}

export class PluginCapabilityAdapter {
	private readonly sessionIdByPlugin = new Map<string, string>();
	private readonly sessions = new Map<string, PluginCapabilitySession>();

	constructor(
		private readonly access: CapabilityAccessSessionFactory,
		private readonly options: PluginCapabilityAdapterOptions,
	) {}

	openSession(pluginId: string): string {
		if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error(`Invalid plugin id: ${pluginId}`);
		const permissions = new Set(this.options.resolvePermissions(pluginId));
		const official = this.options.isOfficialPlugin(pluginId);
		const previousSessionId = this.sessionIdByPlugin.get(pluginId);
		if (previousSessionId) this.closeSession(previousSessionId);

		const sessionId = randomUUID();
		const grants = [
			...(permissions.has(PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_READ)
				? [
						createCapabilityGrant(FOUNDATION_FILESYSTEM_CAPABILITIES.READ_DIRECTORY),
						createCapabilityGrant(FOUNDATION_FILESYSTEM_CAPABILITIES.READ_FILE),
						createCapabilityGrant(FOUNDATION_FILESYSTEM_CAPABILITIES.STAT),
						createCapabilityGrant(FOUNDATION_FILESYSTEM_CAPABILITIES.LIST_FILES_RECURSIVE),
					]
				: []),
			...(permissions.has(PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_WRITE)
				? [
						createCapabilityGrant(FOUNDATION_FILESYSTEM_CAPABILITIES.WRITE_FILE),
						createCapabilityGrant(FOUNDATION_FILESYSTEM_CAPABILITIES.RENAME),
						createCapabilityGrant(FOUNDATION_FILESYSTEM_CAPABILITIES.DELETE),
						createCapabilityGrant(FOUNDATION_FILESYSTEM_CAPABILITIES.MOVE),
						createCapabilityGrant(FOUNDATION_FILESYSTEM_CAPABILITIES.CREATE_DIRECTORY),
					]
				: []),
			...(official
				? [
						createCapabilityGrant(DOMAIN_BATCH_TASK_CAPABILITIES.LIST_PROJECTS),
						createCapabilityGrant(DOMAIN_BATCH_TASK_CAPABILITIES.GET_PROJECT),
						createCapabilityGrant(DOMAIN_BATCH_TASK_CAPABILITIES.CREATE_PROJECT),
						createCapabilityGrant(DOMAIN_BATCH_TASK_CAPABILITIES.UPDATE_PROJECT),
						createCapabilityGrant(DOMAIN_BATCH_TASK_CAPABILITIES.DELETE_PROJECT),
						createCapabilityGrant(DOMAIN_BATCH_TASK_CAPABILITIES.RUN_TASK),
						createCapabilityGrant(DOMAIN_BATCH_TASK_CAPABILITIES.RETRY_TASK),
						createCapabilityGrant(DOMAIN_BATCH_TASK_CAPABILITIES.STOP_TASK),
						createCapabilityGrant(DOMAIN_BATCH_TASK_CAPABILITIES.DELETE_TASK),
						createCapabilityGrant(DOMAIN_BATCH_TASK_CAPABILITIES.RESUME_TASK),
						createCapabilityGrant(DOMAIN_BATCH_TASK_CAPABILITIES.RESUME_TASK_WITH_TEXT),
						createCapabilityGrant(DOMAIN_BATCH_TASK_CAPABILITIES.DELETE_TASK_SESSION),
						createCapabilityGrant(DOMAIN_BATCH_TASK_CAPABILITIES.DELETE_ALL_TASKS),
						createCapabilityGrant(DOMAIN_BATCH_TASK_CAPABILITIES.START_PROJECT),
						createCapabilityGrant(DOMAIN_BATCH_TASK_CAPABILITIES.STOP_PROJECT),
						createCapabilityGrant(DOMAIN_BATCH_TASK_CAPABILITIES.RESET_PROJECT),
						createCapabilityGrant(DOMAIN_BATCH_TASK_CAPABILITIES.RESET_FAILED_TASKS),
						createCapabilityGrant(DOMAIN_DOWNLOAD_CAPABILITIES.LIST),
						createCapabilityGrant(DOMAIN_DOWNLOAD_CAPABILITIES.CANCEL),
						createCapabilityGrant(DOMAIN_KNOWLEDGE_CAPABILITIES.LIST_BASES),
						createCapabilityGrant(DOMAIN_KNOWLEDGE_CAPABILITIES.LIST_FILE_STATUSES),
						createCapabilityGrant(DOMAIN_KNOWLEDGE_CAPABILITIES.GET_PROCESSING_STATUS),
						createCapabilityGrant(DOMAIN_KNOWLEDGE_CAPABILITIES.GET_PROCESSING_SETTINGS),
						createCapabilityGrant(DOMAIN_KNOWLEDGE_CAPABILITIES.CREATE_BASE),
						createCapabilityGrant(DOMAIN_KNOWLEDGE_CAPABILITIES.RENAME_BASE),
						createCapabilityGrant(DOMAIN_KNOWLEDGE_CAPABILITIES.DELETE_BASE),
						createCapabilityGrant(DOMAIN_KNOWLEDGE_CAPABILITIES.ADD_FILES),
						createCapabilityGrant(DOMAIN_KNOWLEDGE_CAPABILITIES.DELETE_ENTRY),
						createCapabilityGrant(DOMAIN_KNOWLEDGE_CAPABILITIES.SCAN_NOW),
						createCapabilityGrant(DOMAIN_KNOWLEDGE_CAPABILITIES.RETRY_FAILED),
						createCapabilityGrant(DOMAIN_KNOWLEDGE_CAPABILITIES.SET_PROCESSING_SETTINGS),
						createCapabilityGrant(DOMAIN_PROJECT_CAPABILITIES.LIST),
						createCapabilityGrant(DOMAIN_PROJECT_CAPABILITIES.CREATE),
						createCapabilityGrant(DOMAIN_PROJECT_CAPABILITIES.OPEN),
						createCapabilityGrant(DOMAIN_PROJECT_CAPABILITIES.RENAME),
						createCapabilityGrant(DOMAIN_PROJECT_CAPABILITIES.ARCHIVE),
						createCapabilityGrant(DOMAIN_PROJECT_CAPABILITIES.UNARCHIVE),
						createCapabilityGrant(DOMAIN_PROJECT_CAPABILITIES.REMOVE),
						createCapabilityGrant(DOMAIN_SESSION_CAPABILITIES.LIST),
						createCapabilityGrant(DOMAIN_SESSION_CAPABILITIES.LIST_RUNTIME_PROJECTS),
						createCapabilityGrant(DOMAIN_SCHEDULER_CAPABILITIES.LIST_TASKS),
						createCapabilityGrant(DOMAIN_SCHEDULER_CAPABILITIES.GET_TASK),
						createCapabilityGrant(DOMAIN_SCHEDULER_CAPABILITIES.LIST_HISTORY),
						createCapabilityGrant(DOMAIN_SCHEDULER_CAPABILITIES.CREATE_TASK),
						createCapabilityGrant(DOMAIN_SCHEDULER_CAPABILITIES.UPDATE_TASK),
						createCapabilityGrant(DOMAIN_SCHEDULER_CAPABILITIES.DELETE_TASK),
						createCapabilityGrant(DOMAIN_SCHEDULER_CAPABILITIES.SET_ENABLED),
						createCapabilityGrant(DOMAIN_SCHEDULER_CAPABILITIES.RUN_TASK),
						createCapabilityGrant(DOMAIN_SCHEDULER_CAPABILITIES.ABORT_TASK),
						createCapabilityGrant(DOMAIN_WEBHOOK_CAPABILITIES.LIST_ENDPOINTS),
						createCapabilityGrant(DOMAIN_WEBHOOK_CAPABILITIES.LIST_PROVIDERS),
						createCapabilityGrant(DOMAIN_WEBHOOK_CAPABILITIES.CREATE_ENDPOINT),
						createCapabilityGrant(DOMAIN_WEBHOOK_CAPABILITIES.UPDATE_ENDPOINT),
						createCapabilityGrant(DOMAIN_WEBHOOK_CAPABILITIES.DELETE_ENDPOINT),
						createCapabilityGrant(DOMAIN_WEBHOOK_CAPABILITIES.SET_ENABLED),
						createCapabilityGrant(DOMAIN_WEBHOOK_CAPABILITIES.TEST_ENDPOINT),
						createCapabilityGrant(DOMAIN_WEBHOOK_CAPABILITIES.SEND_MESSAGE),
					]
				: []),
		];
		const access = this.access.createSession({
			subject: {
				id: `system-adapter:plugin:${pluginId}`,
				sessionId,
			},
			grants,
		});
		this.sessions.set(sessionId, { access, pluginId });
		this.sessionIdByPlugin.set(pluginId, sessionId);
		return sessionId;
	}

	closeSession(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (!session) return;
		session.access.revoke();
		this.sessions.delete(sessionId);
		if (this.sessionIdByPlugin.get(session.pluginId) === sessionId) {
			this.sessionIdByPlugin.delete(session.pluginId);
		}
	}

	dispose(): void {
		for (const sessionId of [...this.sessions.keys()]) this.closeSession(sessionId);
	}

	readDirectory(sessionId: string, path: string): Promise<FilesystemEntry[]> {
		return this.client(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_READ }).invoke(
			FOUNDATION_FILESYSTEM_CAPABILITIES.READ_DIRECTORY,
			{ path },
		);
	}

	readFile(sessionId: string, path: string): Promise<FilesystemReadFileResult> {
		return this.client(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_READ }).invoke(
			FOUNDATION_FILESYSTEM_CAPABILITIES.READ_FILE,
			{ path },
		);
	}

	writeFile(sessionId: string, path: string, content: string, encoding?: "utf8" | "base64"): Promise<undefined> {
		return this.client(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_WRITE }).invoke(
			FOUNDATION_FILESYSTEM_CAPABILITIES.WRITE_FILE,
			{ path, content, encoding },
		);
	}

	stat(sessionId: string, path: string): Promise<FilesystemStatResult | null> {
		return this.client(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_READ }).invoke(
			FOUNDATION_FILESYSTEM_CAPABILITIES.STAT,
			{ path },
		);
	}

	rename(sessionId: string, oldPath: string, newPath: string): Promise<undefined> {
		return this.client(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_WRITE }).invoke(
			FOUNDATION_FILESYSTEM_CAPABILITIES.RENAME,
			{ oldPath, newPath },
		);
	}

	delete(sessionId: string, path: string): Promise<undefined> {
		return this.client(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_WRITE }).invoke(
			FOUNDATION_FILESYSTEM_CAPABILITIES.DELETE,
			{ path },
		);
	}

	move(sessionId: string, sourcePath: string, destinationDirectory: string): Promise<undefined> {
		return this.client(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_WRITE }).invoke(
			FOUNDATION_FILESYSTEM_CAPABILITIES.MOVE,
			{ sourcePath, destinationDirectory },
		);
	}

	createDirectory(sessionId: string, path: string): Promise<undefined> {
		return this.client(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_WRITE }).invoke(
			FOUNDATION_FILESYSTEM_CAPABILITIES.CREATE_DIRECTORY,
			{ path },
		);
	}

	listFilesRecursive(sessionId: string, path: string): Promise<FilesystemFileRef[]> {
		return this.client(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_READ }).invoke(
			FOUNDATION_FILESYSTEM_CAPABILITIES.LIST_FILES_RECURSIVE,
			{ path },
		);
	}

	listProjects(sessionId: string): Promise<ProjectListResult> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_PROJECT_CAPABILITIES.LIST, {});
	}

	createProject(sessionId: string, name: string, path?: string): Promise<ProjectEntry> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_PROJECT_CAPABILITIES.CREATE, { name, path });
	}

	openProject(sessionId: string, path: string, name?: string): Promise<ProjectEntry> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_PROJECT_CAPABILITIES.OPEN, { path, name });
	}

	renameProject(sessionId: string, path: string, name: string): Promise<ProjectEntry> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_PROJECT_CAPABILITIES.RENAME, { path, name });
	}

	archiveProject(sessionId: string, path: string): Promise<undefined> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_PROJECT_CAPABILITIES.ARCHIVE, { path });
	}

	unarchiveProject(sessionId: string, path: string): Promise<undefined> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_PROJECT_CAPABILITIES.UNARCHIVE, { path });
	}

	removeProject(sessionId: string, path: string): Promise<undefined> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_PROJECT_CAPABILITIES.REMOVE, { path });
	}

	listSessions(sessionId: string, cwd: string): Promise<SessionHistoryEntry[]> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_SESSION_CAPABILITIES.LIST, { cwd });
	}

	listRuntimeProjects(sessionId: string): Promise<SessionRuntimeProject[]> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_SESSION_CAPABILITIES.LIST_RUNTIME_PROJECTS, {});
	}

	listDownloads(sessionId: string): Promise<DownloadItem[]> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_DOWNLOAD_CAPABILITIES.LIST, {});
	}

	cancelDownload(sessionId: string, id: string): Promise<undefined> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_DOWNLOAD_CAPABILITIES.CANCEL, { id });
	}

	listBatchProjects(sessionId: string): Promise<BatchProject[]> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_BATCH_TASK_CAPABILITIES.LIST_PROJECTS, {});
	}

	getBatchProject(sessionId: string, projectId: string): Promise<BatchProject> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_BATCH_TASK_CAPABILITIES.GET_PROJECT, {
			projectId,
		});
	}

	createBatchProject(sessionId: string, data: unknown): Promise<BatchProject> {
		const input = DOMAIN_BATCH_TASK_CAPABILITIES.CREATE_PROJECT.parseInput({ data });
		return this.client(sessionId, { official: true }).invoke(DOMAIN_BATCH_TASK_CAPABILITIES.CREATE_PROJECT, input);
	}

	updateBatchProject(sessionId: string, projectId: string, data: unknown): Promise<BatchProject> {
		const input = DOMAIN_BATCH_TASK_CAPABILITIES.UPDATE_PROJECT.parseInput({ projectId, data });
		return this.client(sessionId, { official: true }).invoke(DOMAIN_BATCH_TASK_CAPABILITIES.UPDATE_PROJECT, input);
	}

	deleteBatchProject(sessionId: string, projectId: string): Promise<BatchTaskCommandResult> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_BATCH_TASK_CAPABILITIES.DELETE_PROJECT, {
			projectId,
		});
	}

	runBatchTask(sessionId: string, projectId: string, taskId: string): Promise<BatchTaskCommandResult> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_BATCH_TASK_CAPABILITIES.RUN_TASK, {
			projectId,
			taskId,
		});
	}

	retryBatchTask(sessionId: string, projectId: string, taskId: string): Promise<BatchTaskCommandResult> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_BATCH_TASK_CAPABILITIES.RETRY_TASK, {
			projectId,
			taskId,
		});
	}

	stopBatchTask(sessionId: string, projectId: string, taskId: string): Promise<BatchTaskCommandResult> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_BATCH_TASK_CAPABILITIES.STOP_TASK, {
			projectId,
			taskId,
		});
	}

	deleteBatchTask(sessionId: string, projectId: string, taskId: string): Promise<BatchTaskCommandResult> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_BATCH_TASK_CAPABILITIES.DELETE_TASK, {
			projectId,
			taskId,
		});
	}

	resumeBatchTask(sessionId: string, projectId: string, taskId: string): Promise<BatchTaskCommandResult> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_BATCH_TASK_CAPABILITIES.RESUME_TASK, {
			projectId,
			taskId,
		});
	}

	resumeBatchTaskWithText(
		sessionId: string,
		projectId: string,
		taskId: string,
		text: string,
	): Promise<BatchTaskCommandResult> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_BATCH_TASK_CAPABILITIES.RESUME_TASK_WITH_TEXT, {
			projectId,
			taskId,
			text,
		});
	}

	deleteBatchTaskSession(sessionId: string, projectId: string, taskId: string): Promise<BatchTaskCommandResult> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_BATCH_TASK_CAPABILITIES.DELETE_TASK_SESSION, {
			projectId,
			taskId,
		});
	}

	deleteAllBatchTasks(sessionId: string, projectId: string): Promise<BatchTaskCommandResult> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_BATCH_TASK_CAPABILITIES.DELETE_ALL_TASKS, {
			projectId,
		});
	}

	startBatchProject(sessionId: string, projectId: string): Promise<BatchTaskCommandResult> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_BATCH_TASK_CAPABILITIES.START_PROJECT, {
			projectId,
		});
	}

	stopBatchProject(sessionId: string, projectId: string): Promise<BatchTaskCommandResult> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_BATCH_TASK_CAPABILITIES.STOP_PROJECT, {
			projectId,
		});
	}

	resetBatchProject(sessionId: string, projectId: string): Promise<BatchTaskCommandResult> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_BATCH_TASK_CAPABILITIES.RESET_PROJECT, {
			projectId,
		});
	}

	resetFailedBatchTasks(sessionId: string, projectId: string, taskIds: string[]): Promise<BatchTaskCommandResult> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_BATCH_TASK_CAPABILITIES.RESET_FAILED_TASKS, {
			projectId,
			taskIds,
		});
	}

	listScheduledTasks(sessionId: string): Promise<SchedulerTask[]> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_SCHEDULER_CAPABILITIES.LIST_TASKS, {});
	}

	getScheduledTask(sessionId: string, taskId: string): Promise<SchedulerTask> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_SCHEDULER_CAPABILITIES.GET_TASK, { taskId });
	}

	listScheduledTaskHistory(sessionId: string, taskId: string): Promise<SchedulerExecutionRecord[]> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_SCHEDULER_CAPABILITIES.LIST_HISTORY, {
			taskId,
		});
	}

	createScheduledTask(sessionId: string, data: unknown): Promise<SchedulerTask> {
		const input = DOMAIN_SCHEDULER_CAPABILITIES.CREATE_TASK.parseInput({ data });
		return this.client(sessionId, { official: true }).invoke(DOMAIN_SCHEDULER_CAPABILITIES.CREATE_TASK, input);
	}

	updateScheduledTask(sessionId: string, taskId: string, data: unknown): Promise<SchedulerTask> {
		const input = DOMAIN_SCHEDULER_CAPABILITIES.UPDATE_TASK.parseInput({ taskId, data });
		return this.client(sessionId, { official: true }).invoke(DOMAIN_SCHEDULER_CAPABILITIES.UPDATE_TASK, input);
	}

	deleteScheduledTask(sessionId: string, taskId: string): Promise<SchedulerCommandResult> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_SCHEDULER_CAPABILITIES.DELETE_TASK, { taskId });
	}

	setScheduledTaskEnabled(sessionId: string, taskId: string, enabled: boolean): Promise<SchedulerTask> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_SCHEDULER_CAPABILITIES.SET_ENABLED, {
			taskId,
			enabled,
		});
	}

	runScheduledTask(sessionId: string, taskId: string): Promise<SchedulerCommandResult> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_SCHEDULER_CAPABILITIES.RUN_TASK, { taskId });
	}

	abortScheduledTask(sessionId: string, taskId: string): Promise<SchedulerCommandResult> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_SCHEDULER_CAPABILITIES.ABORT_TASK, { taskId });
	}

	listWebhookEndpoints(sessionId: string): Promise<WebhookEndpoint[]> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_WEBHOOK_CAPABILITIES.LIST_ENDPOINTS, {});
	}

	listWebhookProviders(sessionId: string): Promise<WebhookProviderDescriptor[]> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_WEBHOOK_CAPABILITIES.LIST_PROVIDERS, {});
	}

	createWebhookEndpoint(sessionId: string, data: unknown): Promise<WebhookEndpoint> {
		const input = DOMAIN_WEBHOOK_CAPABILITIES.CREATE_ENDPOINT.parseInput({ data });
		return this.client(sessionId, { official: true }).invoke(DOMAIN_WEBHOOK_CAPABILITIES.CREATE_ENDPOINT, input);
	}

	updateWebhookEndpoint(sessionId: string, id: string, data: unknown): Promise<WebhookEndpoint> {
		const input = DOMAIN_WEBHOOK_CAPABILITIES.UPDATE_ENDPOINT.parseInput({ id, data });
		return this.client(sessionId, { official: true }).invoke(DOMAIN_WEBHOOK_CAPABILITIES.UPDATE_ENDPOINT, input);
	}

	deleteWebhookEndpoint(sessionId: string, id: string): Promise<undefined> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_WEBHOOK_CAPABILITIES.DELETE_ENDPOINT, { id });
	}

	setWebhookEndpointEnabled(sessionId: string, id: string, enabled: boolean): Promise<WebhookEndpoint> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_WEBHOOK_CAPABILITIES.SET_ENABLED, {
			id,
			enabled,
		});
	}

	testWebhookEndpoint(sessionId: string, id: string): Promise<WebhookSendResult> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_WEBHOOK_CAPABILITIES.TEST_ENDPOINT, { id });
	}

	sendWebhookMessage(sessionId: string, id: string, message: unknown): Promise<WebhookSendResult> {
		const input = DOMAIN_WEBHOOK_CAPABILITIES.SEND_MESSAGE.parseInput({ id, message });
		return this.client(sessionId, { official: true }).invoke(DOMAIN_WEBHOOK_CAPABILITIES.SEND_MESSAGE, input);
	}

	listKnowledgeBases(sessionId: string): Promise<KnowledgeBase[]> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_KNOWLEDGE_CAPABILITIES.LIST_BASES, {});
	}

	listKnowledgeFileStatuses(sessionId: string): Promise<KnowledgeFileStatuses> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_KNOWLEDGE_CAPABILITIES.LIST_FILE_STATUSES, {});
	}

	isKnowledgeProcessing(sessionId: string): Promise<boolean> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_KNOWLEDGE_CAPABILITIES.GET_PROCESSING_STATUS, {});
	}

	getKnowledgeProcessing(sessionId: string): Promise<KnowledgeProcessingSettings> {
		return this.client(sessionId, { official: true }).invoke(
			DOMAIN_KNOWLEDGE_CAPABILITIES.GET_PROCESSING_SETTINGS,
			{},
		);
	}

	createKnowledgeBase(sessionId: string, name: string): Promise<undefined> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_KNOWLEDGE_CAPABILITIES.CREATE_BASE, { name });
	}

	renameKnowledgeBase(sessionId: string, name: string, newName: string): Promise<undefined> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_KNOWLEDGE_CAPABILITIES.RENAME_BASE, {
			name,
			newName,
		});
	}

	deleteKnowledgeBase(sessionId: string, name: string): Promise<undefined> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_KNOWLEDGE_CAPABILITIES.DELETE_BASE, { name });
	}

	addKnowledgeFiles(sessionId: string, kbId: string, paths: string[], move: boolean): Promise<undefined> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_KNOWLEDGE_CAPABILITIES.ADD_FILES, {
			kbId,
			paths,
			move,
		});
	}

	deleteKnowledgeEntry(sessionId: string, kbId: string, relPath: string): Promise<undefined> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_KNOWLEDGE_CAPABILITIES.DELETE_ENTRY, {
			kbId,
			relPath,
		});
	}

	scanKnowledgeNow(sessionId: string): Promise<KnowledgeScanResult> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_KNOWLEDGE_CAPABILITIES.SCAN_NOW, {});
	}

	retryFailedKnowledge(sessionId: string): Promise<KnowledgeScanResult> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_KNOWLEDGE_CAPABILITIES.RETRY_FAILED, {});
	}

	setKnowledgeProcessing(sessionId: string, data: unknown): Promise<KnowledgeProcessingSettings> {
		const input = DOMAIN_KNOWLEDGE_CAPABILITIES.SET_PROCESSING_SETTINGS.parseInput({ data });
		return this.client(sessionId, { official: true }).invoke(
			DOMAIN_KNOWLEDGE_CAPABILITIES.SET_PROCESSING_SETTINGS,
			input,
		);
	}

	private client(sessionId: string, requirement: PluginCapabilityRequirement): CapabilityAccessHandle["client"] {
		const session = this.sessions.get(sessionId);
		if (!session || session.access.isRevoked()) {
			throw new CapabilityError(CAPABILITY_ERROR_CODES.SESSION_REVOKED, "Plugin capability session is not active");
		}
		if (requirement.official && !this.options.isOfficialPlugin(session.pluginId)) {
			throw new CapabilityError(CAPABILITY_ERROR_CODES.ACCESS_DENIED, "Plugin official capability access denied");
		}
		if (
			requirement.permission !== undefined &&
			!this.options.resolvePermissions(session.pluginId).includes(requirement.permission)
		) {
			throw new CapabilityError(
				CAPABILITY_ERROR_CODES.ACCESS_DENIED,
				`Plugin capability permission denied: ${requirement.permission}`,
			);
		}
		return session.access.client;
	}
}
