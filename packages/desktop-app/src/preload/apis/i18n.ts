import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";
import { onIpcEvent } from "./helper.js";

const GET_INITIAL_CHANNEL = "vetta:i18n:get-initial-language";
const SET_LANGUAGE_CHANNEL = "vetta:i18n:set-language";
const LANGUAGE_CHANGED_CHANNEL = "vetta:i18n:language-changed";

export function createI18nApi(ipc: IpcRenderer): Pick<DesktopApi, "i18n"> {
	// sendSync 在 preload 求值期同步取主进程当前语言，暴露成普通值供 renderer 首帧前读取。
	// 与 DEFAULT_LANGUAGE 对齐：sendSync 失败时默认英文，勿硬编码 zh。
	const initialLanguage = (ipc.sendSync(GET_INITIAL_CHANNEL) as string | undefined) ?? "en";
	return {
		i18n: {
			initialLanguage,
			setLanguage: (lang: string) => ipc.invoke(SET_LANGUAGE_CHANNEL, lang),
			onLanguageChanged: (handler) => onIpcEvent(ipc, LANGUAGE_CHANGED_CHANNEL, handler),
		},
	};
}
