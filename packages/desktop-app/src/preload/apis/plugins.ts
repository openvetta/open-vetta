import type { IpcRenderer, IpcRendererEvent } from "electron";
import { PLUGIN_CAPABILITY_CHANNELS } from "../../shared/plugin-capability-ipc.js";
import type { DesktopApi } from "../api.js";
import { onIpcEvent } from "./helper.js";

export function createPluginsApi(ipc: IpcRenderer): Pick<DesktopApi, "plugins"> {
	return {
		plugins: {
			internalCapabilities: {
				openSession: (pluginId) => ipc.invoke(PLUGIN_CAPABILITY_CHANNELS.OPEN_SESSION, pluginId),
				closeSession: (sessionId) => ipc.invoke(PLUGIN_CAPABILITY_CHANNELS.CLOSE_SESSION, sessionId),
				filesystem: {
					readDirectory: (sessionId, path) =>
						ipc.invoke(PLUGIN_CAPABILITY_CHANNELS.FS_READ_DIRECTORY, sessionId, path),
					readFile: (sessionId, path) => ipc.invoke(PLUGIN_CAPABILITY_CHANNELS.FS_READ_FILE, sessionId, path),
					writeFile: (sessionId, path, content, encoding) =>
						ipc.invoke(PLUGIN_CAPABILITY_CHANNELS.FS_WRITE_FILE, sessionId, path, content, encoding),
					stat: (sessionId, path) => ipc.invoke(PLUGIN_CAPABILITY_CHANNELS.FS_STAT, sessionId, path),
					rename: (sessionId, oldPath, newPath) =>
						ipc.invoke(PLUGIN_CAPABILITY_CHANNELS.FS_RENAME, sessionId, oldPath, newPath),
					delete: (sessionId, path) => ipc.invoke(PLUGIN_CAPABILITY_CHANNELS.FS_DELETE, sessionId, path),
					move: (sessionId, sourcePath, destinationDirectory) =>
						ipc.invoke(PLUGIN_CAPABILITY_CHANNELS.FS_MOVE, sessionId, sourcePath, destinationDirectory),
					createDirectory: (sessionId, path) =>
						ipc.invoke(PLUGIN_CAPABILITY_CHANNELS.FS_CREATE_DIRECTORY, sessionId, path),
					listFilesRecursive: (sessionId, path) =>
						ipc.invoke(PLUGIN_CAPABILITY_CHANNELS.FS_LIST_FILES_RECURSIVE, sessionId, path),
				},
				downloads: {
					list: (sessionId) => ipc.invoke(PLUGIN_CAPABILITY_CHANNELS.DOWNLOAD_LIST, sessionId),
					cancel: (sessionId, id) => ipc.invoke(PLUGIN_CAPABILITY_CHANNELS.DOWNLOAD_CANCEL, sessionId, id),
				},
				projects: {
					list: (sessionId) => ipc.invoke(PLUGIN_CAPABILITY_CHANNELS.PROJECT_LIST, sessionId),
					create: (sessionId, name, path) =>
						ipc.invoke(PLUGIN_CAPABILITY_CHANNELS.PROJECT_CREATE, sessionId, name, path),
					open: (sessionId, path, name) =>
						ipc.invoke(PLUGIN_CAPABILITY_CHANNELS.PROJECT_OPEN, sessionId, path, name),
					rename: (sessionId, path, name) =>
						ipc.invoke(PLUGIN_CAPABILITY_CHANNELS.PROJECT_RENAME, sessionId, path, name),
					archive: (sessionId, path) => ipc.invoke(PLUGIN_CAPABILITY_CHANNELS.PROJECT_ARCHIVE, sessionId, path),
					unarchive: (sessionId, path) =>
						ipc.invoke(PLUGIN_CAPABILITY_CHANNELS.PROJECT_UNARCHIVE, sessionId, path),
					remove: (sessionId, path) => ipc.invoke(PLUGIN_CAPABILITY_CHANNELS.PROJECT_REMOVE, sessionId, path),
				},
				sessions: {
					list: (sessionId, cwd) => ipc.invoke(PLUGIN_CAPABILITY_CHANNELS.SESSION_LIST, sessionId, cwd),
					listRuntimeProjects: (sessionId) =>
						ipc.invoke(PLUGIN_CAPABILITY_CHANNELS.SESSION_LIST_RUNTIME_PROJECTS, sessionId),
				},
			},
			list: () => ipc.invoke("vetta:plugins:list"),
			installFromArchive: (archiveBuffer, options) =>
				ipc.invoke("vetta:plugins:install-from-archive", archiveBuffer, options),
			installFromUrl: (url, options) => ipc.invoke("vetta:plugins:install-from-url", url, options),
			installFromPath: (path, options) => ipc.invoke("vetta:plugins:install-from-path", path, options),
			uninstall: (id) => ipc.invoke("vetta:plugins:uninstall", id),
			setEnabled: (id, enabled) => ipc.invoke("vetta:plugins:set-enabled", id, enabled),
			grantPermissions: (id, permissions) => ipc.invoke("vetta:plugins:grant-permissions", id, permissions),
			revokePermissions: (id, permissions) => ipc.invoke("vetta:plugins:revoke-permissions", id, permissions),
			grantCommands: (id, names) => ipc.invoke("vetta:plugins:grant-commands", id, names),
			revokeCommands: (id, names) => ipc.invoke("vetta:plugins:revoke-commands", id, names),
			runCommand: (pluginId, file, args, options) =>
				ipc.invoke("vetta:plugins:command-run", pluginId, file, args, options),
			reload: (id) => ipc.invoke("vetta:plugins:reload", id),
			startDevWatch: (id, projectDir) => ipc.invoke("vetta:plugins:dev-watch-start", id, projectDir),
			stopDevWatch: (id) => ipc.invoke("vetta:plugins:dev-watch-stop", id),
			registerModeGate: (pluginId) => ipc.invoke("vetta:plugins:register-mode-gate", pluginId),
			setContributionMode: (pluginId, active) => ipc.invoke("vetta:plugins:set-contribution-mode", pluginId, active),
			beginAgentContributionsLoad: (pluginId, activationId) =>
				ipc.invoke("vetta:plugins:agent-contributions-begin-load", pluginId, activationId),
			registerAgentTool: (pluginId, registration) =>
				ipc.invoke("vetta:plugins:agent-tool-register", pluginId, registration),
			unregisterAgentTool: (pluginId, toolId, activationId) =>
				ipc.invoke("vetta:plugins:agent-tool-unregister", pluginId, toolId, activationId),
			clearAgentContributions: (pluginId, activationId) =>
				ipc.invoke("vetta:plugins:agent-contributions-clear", pluginId, activationId),
			onAgentToolRequest: (handler) => onIpcEvent(ipc, "vetta:plugins:agent-tool-request", handler),
			respondAgentTool: (requestId, result) => ipc.invoke("vetta:plugins:agent-tool-response", requestId, result),
			registerAppAction: (pluginId, registration) =>
				ipc.invoke("vetta:plugins:app-action-register", pluginId, registration),
			commitAppActionActivation: (pluginId, activationId) =>
				ipc.invoke("vetta:plugins:app-action-activation-commit", pluginId, activationId),
			abortAppActionActivation: (pluginId, activationId) =>
				ipc.invoke("vetta:plugins:app-action-activation-abort", pluginId, activationId),
			unregisterAppAction: (pluginId, actionId, activationId) =>
				ipc.invoke("vetta:plugins:app-action-unregister", pluginId, actionId, activationId),
			onAppActionRequest: (handler) => onIpcEvent(ipc, "vetta:plugins:app-action-request", handler),
			onAppActionCancel: (handler) => onIpcEvent(ipc, "vetta:plugins:app-action-cancel", handler),
			respondAppAction: (requestId, result) => ipc.invoke("vetta:plugins:app-action-response", requestId, result),
			registerContinuationProvider: (pluginId, registration) =>
				ipc.invoke("vetta:plugins:continuation-register", pluginId, registration),
			unregisterContinuationProvider: (pluginId, providerId, activationId) =>
				ipc.invoke("vetta:plugins:continuation-unregister", pluginId, providerId, activationId),
			onContinuationRequest: (handler) => onIpcEvent(ipc, "vetta:plugins:continuation-request", handler),
			respondContinuation: (requestId, result) =>
				ipc.invoke("vetta:plugins:continuation-response", requestId, result),
			registerSystemPromptProvider: (pluginId, registration) =>
				ipc.invoke("vetta:plugins:system-prompt-provider-register", pluginId, registration),
			unregisterSystemPromptProvider: (pluginId, providerId, activationId) =>
				ipc.invoke("vetta:plugins:system-prompt-provider-unregister", pluginId, providerId, activationId),
			onSystemPromptRequest: (handler) => onIpcEvent(ipc, "vetta:plugins:system-prompt-request", handler),
			respondSystemPrompt: (requestId, result) =>
				ipc.invoke("vetta:plugins:system-prompt-response", requestId, result),
			getSettings: (id) => ipc.invoke("vetta:plugins:get-settings", id),
			setSettings: (id, values) => ipc.invoke("vetta:plugins:set-settings", id, values),
			generateImage: (pluginId, input) => ipc.invoke("vetta:plugins:images:generate", pluginId, input),
			editImage: (pluginId, input) => ipc.invoke("vetta:plugins:images:edit", pluginId, input),
			imageLineage: (pluginId, imageId) => ipc.invoke("vetta:plugins:images:lineage", pluginId, imageId),
			sessionLineages: (pluginId, sessionId) =>
				ipc.invoke("vetta:plugins:images:session-lineages", pluginId, sessionId),
			onSettingsChanged: (listener) => {
				const handler = (
					_event: IpcRendererEvent,
					payload: { pluginId: string; values: Record<string, unknown> },
				) => listener(payload);
				ipc.on("vetta:plugins:settings-changed", handler);
				return () => ipc.removeListener("vetta:plugins:settings-changed", handler);
			},
			onPluginsChanged: (listener) => {
				const handler = () => listener();
				ipc.on("vetta:plugins:changed", handler);
				return () => ipc.removeListener("vetta:plugins:changed", handler);
			},
		},
	};
}
