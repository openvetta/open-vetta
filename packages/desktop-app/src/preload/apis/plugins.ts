import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";

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
		},
	};
}
