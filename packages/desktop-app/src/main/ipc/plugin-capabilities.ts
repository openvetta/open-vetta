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

	return () => {
		for (const channel of Object.values(PLUGIN_CAPABILITY_CHANNELS)) ipcMain.removeHandler(channel);
	};
}
