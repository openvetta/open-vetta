import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";

export function createThemesApi(ipc: IpcRenderer): Pick<DesktopApi, "themes"> {
	return {
		themes: {
			list: () => ipc.invoke("vetta:themes:list"),
		},
	};
}
