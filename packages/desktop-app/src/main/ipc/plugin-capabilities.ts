import { ipcMain } from "electron";
import { PLUGIN_CAPABILITY_CHANNELS } from "../../shared/plugin-capability-ipc.js";
import { getDesktopCapabilityHost } from "../capabilities/capability-host.js";

function requireString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} must be a string`);
	return value;
}

function optionalString(value: unknown, field: string): string | undefined {
	if (value === undefined) return undefined;
	return requireString(value, field);
}

function requireBoolean(value: unknown, field: string): boolean {
	if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
	return value;
}

function requireStringArray(value: unknown, field: string): string[] {
	if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
		throw new Error(`${field} must be an array of strings`);
	}
	return value;
}

export function registerPluginCapabilitiesIpc(): () => void {
	const adapter = getDesktopCapabilityHost().adapters.plugin;
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.OPEN_SESSION, (_event, pluginId: unknown) =>
		adapter.openSession(requireString(pluginId, "pluginId")),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.CLOSE_SESSION, (_event, sessionId: unknown) =>
		adapter.closeSession(requireString(sessionId, "sessionId")),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.FS_READ_DIRECTORY, (_event, sessionId: unknown, path: unknown) =>
		adapter.readDirectory(requireString(sessionId, "sessionId"), requireString(path, "path")),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.FS_READ_FILE, (_event, sessionId: unknown, path: unknown) =>
		adapter.readFile(requireString(sessionId, "sessionId"), requireString(path, "path")),
	);
	ipcMain.handle(
		PLUGIN_CAPABILITY_CHANNELS.FS_WRITE_FILE,
		(_event, sessionId: unknown, path: unknown, content: unknown, encoding: unknown) => {
			if (typeof content !== "string") throw new Error("content must be a string");
			if (encoding !== undefined && encoding !== "utf8" && encoding !== "base64") {
				throw new Error("encoding must be utf8 or base64");
			}
			return adapter.writeFile(
				requireString(sessionId, "sessionId"),
				requireString(path, "path"),
				content,
				encoding,
			);
		},
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.FS_STAT, (_event, sessionId: unknown, path: unknown) =>
		adapter.stat(requireString(sessionId, "sessionId"), requireString(path, "path")),
	);
	ipcMain.handle(
		PLUGIN_CAPABILITY_CHANNELS.FS_RENAME,
		(_event, sessionId: unknown, oldPath: unknown, newPath: unknown) =>
			adapter.rename(
				requireString(sessionId, "sessionId"),
				requireString(oldPath, "oldPath"),
				requireString(newPath, "newPath"),
			),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.FS_DELETE, (_event, sessionId: unknown, path: unknown) =>
		adapter.delete(requireString(sessionId, "sessionId"), requireString(path, "path")),
	);
	ipcMain.handle(
		PLUGIN_CAPABILITY_CHANNELS.FS_MOVE,
		(_event, sessionId: unknown, sourcePath: unknown, destinationDirectory: unknown) =>
			adapter.move(
				requireString(sessionId, "sessionId"),
				requireString(sourcePath, "sourcePath"),
				requireString(destinationDirectory, "destinationDirectory"),
			),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.FS_CREATE_DIRECTORY, (_event, sessionId: unknown, path: unknown) =>
		adapter.createDirectory(requireString(sessionId, "sessionId"), requireString(path, "path")),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.FS_LIST_FILES_RECURSIVE, (_event, sessionId: unknown, path: unknown) =>
		adapter.listFilesRecursive(requireString(sessionId, "sessionId"), requireString(path, "path")),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.PROJECT_LIST, (_event, sessionId: unknown) =>
		adapter.listProjects(requireString(sessionId, "sessionId")),
	);
	ipcMain.handle(
		PLUGIN_CAPABILITY_CHANNELS.PROJECT_CREATE,
		(_event, sessionId: unknown, name: unknown, path: unknown) =>
			adapter.createProject(
				requireString(sessionId, "sessionId"),
				requireString(name, "name"),
				optionalString(path, "path"),
			),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.PROJECT_OPEN, (_event, sessionId: unknown, path: unknown, name: unknown) =>
		adapter.openProject(
			requireString(sessionId, "sessionId"),
			requireString(path, "path"),
			optionalString(name, "name"),
		),
	);
	ipcMain.handle(
		PLUGIN_CAPABILITY_CHANNELS.PROJECT_RENAME,
		(_event, sessionId: unknown, path: unknown, name: unknown) =>
			adapter.renameProject(
				requireString(sessionId, "sessionId"),
				requireString(path, "path"),
				requireString(name, "name"),
			),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.PROJECT_ARCHIVE, (_event, sessionId: unknown, path: unknown) =>
		adapter.archiveProject(requireString(sessionId, "sessionId"), requireString(path, "path")),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.PROJECT_UNARCHIVE, (_event, sessionId: unknown, path: unknown) =>
		adapter.unarchiveProject(requireString(sessionId, "sessionId"), requireString(path, "path")),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.PROJECT_REMOVE, (_event, sessionId: unknown, path: unknown) =>
		adapter.removeProject(requireString(sessionId, "sessionId"), requireString(path, "path")),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.SESSION_LIST, (_event, sessionId: unknown, cwd: unknown) =>
		adapter.listSessions(requireString(sessionId, "sessionId"), requireString(cwd, "cwd")),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.SESSION_LIST_RUNTIME_PROJECTS, (_event, sessionId: unknown) =>
		adapter.listRuntimeProjects(requireString(sessionId, "sessionId")),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.DOWNLOAD_LIST, (_event, sessionId: unknown) =>
		adapter.listDownloads(requireString(sessionId, "sessionId")),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.DOWNLOAD_CANCEL, (_event, sessionId: unknown, id: unknown) =>
		adapter.cancelDownload(requireString(sessionId, "sessionId"), requireString(id, "id")),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.KNOWLEDGE_BASE_LIST, (_event, sessionId: unknown) =>
		adapter.listKnowledgeBases(requireString(sessionId, "sessionId")),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.KNOWLEDGE_FILE_STATUS_LIST, (_event, sessionId: unknown) =>
		adapter.listKnowledgeFileStatuses(requireString(sessionId, "sessionId")),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.KNOWLEDGE_PROCESSING_STATUS_GET, (_event, sessionId: unknown) =>
		adapter.isKnowledgeProcessing(requireString(sessionId, "sessionId")),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.KNOWLEDGE_PROCESSING_SETTINGS_GET, (_event, sessionId: unknown) =>
		adapter.getKnowledgeProcessing(requireString(sessionId, "sessionId")),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.KNOWLEDGE_BASE_CREATE, (_event, sessionId: unknown, name: unknown) =>
		adapter.createKnowledgeBase(requireString(sessionId, "sessionId"), requireString(name, "name")),
	);
	ipcMain.handle(
		PLUGIN_CAPABILITY_CHANNELS.KNOWLEDGE_BASE_RENAME,
		(_event, sessionId: unknown, name: unknown, newName: unknown) =>
			adapter.renameKnowledgeBase(
				requireString(sessionId, "sessionId"),
				requireString(name, "name"),
				requireString(newName, "newName"),
			),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.KNOWLEDGE_BASE_DELETE, (_event, sessionId: unknown, name: unknown) =>
		adapter.deleteKnowledgeBase(requireString(sessionId, "sessionId"), requireString(name, "name")),
	);
	ipcMain.handle(
		PLUGIN_CAPABILITY_CHANNELS.KNOWLEDGE_ENTRY_ADD_FILES,
		(_event, sessionId: unknown, kbId: unknown, paths: unknown, move: unknown) =>
			adapter.addKnowledgeFiles(
				requireString(sessionId, "sessionId"),
				requireString(kbId, "kbId"),
				requireStringArray(paths, "paths"),
				requireBoolean(move, "move"),
			),
	);
	ipcMain.handle(
		PLUGIN_CAPABILITY_CHANNELS.KNOWLEDGE_ENTRY_DELETE,
		(_event, sessionId: unknown, kbId: unknown, relPath: unknown) =>
			adapter.deleteKnowledgeEntry(
				requireString(sessionId, "sessionId"),
				requireString(kbId, "kbId"),
				requireString(relPath, "relPath"),
			),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.KNOWLEDGE_PROCESSING_SCAN, (_event, sessionId: unknown) =>
		adapter.scanKnowledgeNow(requireString(sessionId, "sessionId")),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.KNOWLEDGE_PROCESSING_RETRY_FAILED, (_event, sessionId: unknown) =>
		adapter.retryFailedKnowledge(requireString(sessionId, "sessionId")),
	);
	ipcMain.handle(
		PLUGIN_CAPABILITY_CHANNELS.KNOWLEDGE_PROCESSING_SETTINGS_SET,
		(_event, sessionId: unknown, data: unknown) =>
			adapter.setKnowledgeProcessing(requireString(sessionId, "sessionId"), data),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.SCHEDULER_TASK_LIST, (_event, sessionId: unknown) =>
		adapter.listScheduledTasks(requireString(sessionId, "sessionId")),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.SCHEDULER_TASK_GET, (_event, sessionId: unknown, taskId: unknown) =>
		adapter.getScheduledTask(requireString(sessionId, "sessionId"), requireString(taskId, "taskId")),
	);
	ipcMain.handle(
		PLUGIN_CAPABILITY_CHANNELS.SCHEDULER_TASK_HISTORY_LIST,
		(_event, sessionId: unknown, taskId: unknown) =>
			adapter.listScheduledTaskHistory(requireString(sessionId, "sessionId"), requireString(taskId, "taskId")),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.SCHEDULER_TASK_CREATE, (_event, sessionId: unknown, data: unknown) =>
		adapter.createScheduledTask(requireString(sessionId, "sessionId"), data),
	);
	ipcMain.handle(
		PLUGIN_CAPABILITY_CHANNELS.SCHEDULER_TASK_UPDATE,
		(_event, sessionId: unknown, taskId: unknown, data: unknown) =>
			adapter.updateScheduledTask(requireString(sessionId, "sessionId"), requireString(taskId, "taskId"), data),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.SCHEDULER_TASK_DELETE, (_event, sessionId: unknown, taskId: unknown) =>
		adapter.deleteScheduledTask(requireString(sessionId, "sessionId"), requireString(taskId, "taskId")),
	);
	ipcMain.handle(
		PLUGIN_CAPABILITY_CHANNELS.SCHEDULER_TASK_SET_ENABLED,
		(_event, sessionId: unknown, taskId: unknown, enabled: unknown) =>
			adapter.setScheduledTaskEnabled(
				requireString(sessionId, "sessionId"),
				requireString(taskId, "taskId"),
				requireBoolean(enabled, "enabled"),
			),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.SCHEDULER_TASK_RUN, (_event, sessionId: unknown, taskId: unknown) =>
		adapter.runScheduledTask(requireString(sessionId, "sessionId"), requireString(taskId, "taskId")),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.SCHEDULER_TASK_ABORT, (_event, sessionId: unknown, taskId: unknown) =>
		adapter.abortScheduledTask(requireString(sessionId, "sessionId"), requireString(taskId, "taskId")),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.WEBHOOK_ENDPOINT_LIST, (_event, sessionId: unknown) =>
		adapter.listWebhookEndpoints(requireString(sessionId, "sessionId")),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.WEBHOOK_PROVIDER_LIST, (_event, sessionId: unknown) =>
		adapter.listWebhookProviders(requireString(sessionId, "sessionId")),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.WEBHOOK_ENDPOINT_CREATE, (_event, sessionId: unknown, data: unknown) =>
		adapter.createWebhookEndpoint(requireString(sessionId, "sessionId"), data),
	);
	ipcMain.handle(
		PLUGIN_CAPABILITY_CHANNELS.WEBHOOK_ENDPOINT_UPDATE,
		(_event, sessionId: unknown, id: unknown, data: unknown) =>
			adapter.updateWebhookEndpoint(requireString(sessionId, "sessionId"), requireString(id, "id"), data),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.WEBHOOK_ENDPOINT_DELETE, (_event, sessionId: unknown, id: unknown) =>
		adapter.deleteWebhookEndpoint(requireString(sessionId, "sessionId"), requireString(id, "id")),
	);
	ipcMain.handle(
		PLUGIN_CAPABILITY_CHANNELS.WEBHOOK_ENDPOINT_SET_ENABLED,
		(_event, sessionId: unknown, id: unknown, enabled: unknown) =>
			adapter.setWebhookEndpointEnabled(
				requireString(sessionId, "sessionId"),
				requireString(id, "id"),
				requireBoolean(enabled, "enabled"),
			),
	);
	ipcMain.handle(PLUGIN_CAPABILITY_CHANNELS.WEBHOOK_ENDPOINT_TEST, (_event, sessionId: unknown, id: unknown) =>
		adapter.testWebhookEndpoint(requireString(sessionId, "sessionId"), requireString(id, "id")),
	);
	ipcMain.handle(
		PLUGIN_CAPABILITY_CHANNELS.WEBHOOK_ENDPOINT_SEND,
		(_event, sessionId: unknown, id: unknown, message: unknown) =>
			adapter.sendWebhookMessage(requireString(sessionId, "sessionId"), requireString(id, "id"), message),
	);

	return () => {
		for (const channel of Object.values(PLUGIN_CAPABILITY_CHANNELS)) ipcMain.removeHandler(channel);
	};
}
