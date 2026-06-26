// 语言切换的 IPC 边界。
// - get-initial-language：同步通道（sendSync），供 renderer 在首帧前同步拿初值防闪。
// - set-language：renderer 触发 → 持久化 desktop-config → 切主进程语言 → 重建托盘菜单
//   → 广播 language-changed 给所有窗口（各 renderer 据此 i18n.changeLanguage）。

import { BrowserWindow, type IpcMainEvent, ipcMain } from "electron";
import { type AppLanguage, isSupportedLanguage } from "../../shared/i18n/config.js";
import { getAppLanguage, setAppLanguage } from "../i18n/index.js";
import { rebuildTrayContextMenu } from "../tray-manager.js";
import { readDesktopConfig, writeDesktopConfig } from "./fs.js";

export const I18N_GET_INITIAL_CHANNEL = "vetta:i18n:get-initial-language";
export const I18N_SET_LANGUAGE_CHANNEL = "vetta:i18n:set-language";
export const I18N_LANGUAGE_CHANGED_CHANNEL = "vetta:i18n:language-changed";

export function registerI18nIpc(): () => void {
	// 同步返回当前语言。preload 在 contextBridge 暴露前 sendSync 取值，故必须在
	// 窗口创建前注册——本函数在 registerAllIpc 内调用，仍早于异步 page-load 触发 preload。
	const onGetInitial = (event: IpcMainEvent): void => {
		event.returnValue = getAppLanguage();
	};
	ipcMain.on(I18N_GET_INITIAL_CHANNEL, onGetInitial);

	ipcMain.handle(I18N_SET_LANGUAGE_CHANNEL, async (_event, raw: unknown): Promise<void> => {
		if (!isSupportedLanguage(raw)) return;
		const lang: AppLanguage = raw;
		if (lang === getAppLanguage()) return;

		setAppLanguage(lang);
		const config = await readDesktopConfig();
		await writeDesktopConfig({ ...config, language: lang });
		rebuildTrayContextMenu();

		for (const win of BrowserWindow.getAllWindows()) {
			if (!win.isDestroyed()) win.webContents.send(I18N_LANGUAGE_CHANGED_CHANNEL, lang);
		}
	});

	return () => {
		ipcMain.removeListener(I18N_GET_INITIAL_CHANNEL, onGetInitial);
		ipcMain.removeHandler(I18N_SET_LANGUAGE_CHANNEL);
	};
}
