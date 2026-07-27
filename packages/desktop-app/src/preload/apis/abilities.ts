import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";

export function createAbilitiesApi(ipc: IpcRenderer): Pick<DesktopApi, "abilities"> {
	return {
		abilities: {
			getLedger: () => ipc.invoke("vetta:abilities:get-ledger"),
			recordMcpInstall: (slug, version) => ipc.invoke("vetta:abilities:record-mcp-install", slug, version),
		},
	};
}
