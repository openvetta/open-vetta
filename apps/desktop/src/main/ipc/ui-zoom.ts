// 界面缩放的 IPC 边界：renderer 读取当前比例、设置新比例；变化由 service 广播。

import { ipcMain } from "electron";
import { getUiZoomFactor, setUiZoomFactor } from "../ui-zoom/ui-zoom-service.js";

export const UI_ZOOM_GET_CHANNEL = "vetta:ui-zoom:get";
export const UI_ZOOM_SET_CHANNEL = "vetta:ui-zoom:set";

export function registerUiZoomIpc(): () => void {
	ipcMain.handle(UI_ZOOM_GET_CHANNEL, () => getUiZoomFactor());
	ipcMain.handle(UI_ZOOM_SET_CHANNEL, (_event, raw: unknown) => setUiZoomFactor(raw));
	return () => {
		ipcMain.removeHandler(UI_ZOOM_GET_CHANNEL);
		ipcMain.removeHandler(UI_ZOOM_SET_CHANNEL);
	};
}
