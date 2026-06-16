import type { IpcRenderer } from "electron";
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
			registerAgentTool: (pluginId, registration) =>
				ipc.invoke("vetta:plugins:agent-tool-register", pluginId, registration),
			unregisterAgentTool: (pluginId, toolId) => ipc.invoke("vetta:plugins:agent-tool-unregister", pluginId, toolId),
			clearAgentTools: (pluginId) => ipc.invoke("vetta:plugins:agent-tools-clear", pluginId),
			onAgentToolRequest: (handler) => onIpcEvent(ipc, "vetta:plugins:agent-tool-request", handler),
			respondAgentTool: (requestId, result) => ipc.invoke("vetta:plugins:agent-tool-response", requestId, result),
		},
	};
}
