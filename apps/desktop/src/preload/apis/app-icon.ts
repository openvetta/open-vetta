import type { IpcRenderer } from "electron";
import type { AppIconId } from "../../shared/app-icon.js";
import type { DesktopApi } from "../api.js";
import { onIpcEvent } from "./helper.js";

const GET_CHANNEL = "vetta:app-icon:get";
const SET_CHANNEL = "vetta:app-icon:set";
const CHANGED_CHANNEL = "vetta:app-icon:changed";

export function createAppIconApi(ipc: IpcRenderer): Pick<DesktopApi, "appIcon"> {
	return {
		appIcon: {
			get: () => ipc.invoke(GET_CHANNEL) as Promise<AppIconId>,
			set: (id: AppIconId) => ipc.invoke(SET_CHANNEL, id) as Promise<AppIconId>,
			onChanged: (handler) => onIpcEvent<AppIconId>(ipc, CHANGED_CHANNEL, handler),
		},
	};
}
