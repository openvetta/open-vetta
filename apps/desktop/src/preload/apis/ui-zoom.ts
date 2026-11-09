import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";
import { onIpcEvent } from "./helper.js";

const GET_CHANNEL = "vetta:ui-zoom:get";
const SET_CHANNEL = "vetta:ui-zoom:set";
const CHANGED_CHANNEL = "vetta:ui-zoom:changed";

export function createUiZoomApi(ipc: IpcRenderer): Pick<DesktopApi, "uiZoom"> {
	return {
		uiZoom: {
			get: () => ipc.invoke(GET_CHANNEL) as Promise<number>,
			set: (factor: number) => ipc.invoke(SET_CHANNEL, factor) as Promise<number>,
			onChanged: (handler) => onIpcEvent<number>(ipc, CHANGED_CHANNEL, handler),
		},
	};
}
