import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";

const CHANNELS = {
	GET_CONFIG: "vetta:pet:get-config",
	SET_CONFIG: "vetta:pet:set-config",
	SHOW: "vetta:pet:show",
	HIDE: "vetta:pet:hide",
	SET_ACTION: "vetta:pet:set-action",
	GET_DECORATIONS: "vetta:pet:get-decorations",
} as const;

export function createPetApi(ipc: IpcRenderer): Pick<DesktopApi, "pet"> {
	return {
		pet: {
			getConfig: () => ipc.invoke(CHANNELS.GET_CONFIG),
			setConfig: (patch) => ipc.invoke(CHANNELS.SET_CONFIG, patch),
			show: () => ipc.invoke(CHANNELS.SHOW),
			hide: () => ipc.invoke(CHANNELS.HIDE),
			setAction: (actionId) => ipc.invoke(CHANNELS.SET_ACTION, actionId),
			getDecorations: () => ipc.invoke(CHANNELS.GET_DECORATIONS),
		},
	};
}
