import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";

export function createAbilitiesApi(ipc: IpcRenderer): Pick<DesktopApi, "abilities"> {
	return {
		abilities: {
			getLedger: () => ipc.invoke("vetta:abilities:get-ledger"),
			recordMcpInstall: (slug, version) => ipc.invoke("vetta:abilities:record-mcp-install", slug, version),
			listOpenMarketplace: () => ipc.invoke("vetta:abilities:list-open-marketplace"),
			refreshOpenMarketplace: () => ipc.invoke("vetta:abilities:refresh-open-marketplace"),
			installOpenAbility: (type, slug) => ipc.invoke("vetta:abilities:install-open-ability", type, slug),
		},
	};
}
