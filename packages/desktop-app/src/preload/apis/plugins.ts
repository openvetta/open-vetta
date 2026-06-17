import type { IpcRenderer, IpcRendererEvent } from "electron";
import type { DesktopApi } from "../api.js";
import { onIpcEvent } from "./helper.js";

export function createPluginsApi(ipc: IpcRenderer): Pick<DesktopApi, "plugins"> {
	return {
		plugins: {
			list: () => ipc.invoke("vetta:plugins:list"),
			installFromArchive: (archiveBuffer, options) =>
				ipc.invoke("vetta:plugins:install-from-archive", archiveBuffer, options),
			installFromUrl: (url, options) => ipc.invoke("vetta:plugins:install-from-url", url, options),
			uninstall: (id) => ipc.invoke("vetta:plugins:uninstall", id),
			setEnabled: (id, enabled) => ipc.invoke("vetta:plugins:set-enabled", id, enabled),
			grantPermissions: (id, permissions) => ipc.invoke("vetta:plugins:grant-permissions", id, permissions),
			revokePermissions: (id, permissions) => ipc.invoke("vetta:plugins:revoke-permissions", id, permissions),
			reload: (id) => ipc.invoke("vetta:plugins:reload", id),
			beginAgentToolsLoad: (pluginId, activationId) =>
				ipc.invoke("vetta:plugins:agent-tools-begin-load", pluginId, activationId),
			registerAgentTool: (pluginId, registration) =>
				ipc.invoke("vetta:plugins:agent-tool-register", pluginId, registration),
			unregisterAgentTool: (pluginId, toolId, activationId) =>
				ipc.invoke("vetta:plugins:agent-tool-unregister", pluginId, toolId, activationId),
			clearAgentTools: (pluginId, activationId) =>
				ipc.invoke("vetta:plugins:agent-tools-clear", pluginId, activationId),
			onAgentToolRequest: (handler) => onIpcEvent(ipc, "vetta:plugins:agent-tool-request", handler),
			respondAgentTool: (requestId, result) => ipc.invoke("vetta:plugins:agent-tool-response", requestId, result),
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
		},
	};
}
