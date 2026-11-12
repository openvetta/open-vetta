// 应用图标的 IPC 边界：renderer 读取当前图标、设置新图标；变化由 service 广播。

import { ipcMain } from "electron";
import { getAppIconId, setAppIconId } from "../app-icon/app-icon-service.js";

export const APP_ICON_GET_CHANNEL = "vetta:app-icon:get";
export const APP_ICON_SET_CHANNEL = "vetta:app-icon:set";

export function registerAppIconIpc(): () => void {
	ipcMain.handle(APP_ICON_GET_CHANNEL, () => getAppIconId());
	ipcMain.handle(APP_ICON_SET_CHANNEL, (_event, raw: unknown) => setAppIconId(raw));
	return () => {
		ipcMain.removeHandler(APP_ICON_GET_CHANNEL);
		ipcMain.removeHandler(APP_ICON_SET_CHANNEL);
	};
}
