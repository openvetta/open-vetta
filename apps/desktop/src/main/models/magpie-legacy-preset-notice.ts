import { type BrowserWindow, dialog } from "electron";
import { mainT } from "../i18n/index.js";
import { getAppLogger } from "../logger.js";
import { getMainWindow } from "../window-manager.js";
import { type LegacyMagpieRemoval, removeLegacyMagpiePreset } from "./magpie-legacy-preset.js";
import { getDesktopModelSettingsService } from "./model-settings-host.js";

const log = getAppLogger("magpie-migration");
const WINDOW_POLL_MS = 500;
const WINDOW_WAIT_LIMIT_MS = 30_000;

/**
 * 升级后首次启动:删掉旧版在 Vetta 里启用的 Magpie,并弹窗告诉用户改去 Magpie 里接入。
 * 删过一次条目就不在了,之后的启动不会再弹。
 */
export async function migrateLegacyMagpiePreset(): Promise<void> {
	let removed: LegacyMagpieRemoval | null;
	try {
		removed = await removeLegacyMagpiePreset(getDesktopModelSettingsService());
	} catch (error) {
		log.warn("移除旧版 Magpie 配置失败:", error);
		return;
	}
	if (!removed) return;
	log.info("已移除旧版在 Vetta 里启用的 Magpie 配置,改由 Magpie 接入");
	const window = await loadedMainWindow();
	const options = {
		type: "info" as const,
		title: mainT("magpieHandover.title"),
		message: mainT("magpieHandover.message"),
		detail: removed.defaultModelCleared
			? `${mainT("magpieHandover.detail")}\n\n${mainT("magpieHandover.defaultModelCleared")}`
			: mainT("magpieHandover.detail"),
		buttons: [mainT("magpieHandover.ok")],
		noLink: true,
	};
	await (window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options));
}

/** 等主窗口加载完再弹,否则提示会先于界面出现、或挂在一个还没显示的窗口上。 */
async function loadedMainWindow(): Promise<BrowserWindow | undefined> {
	for (let waited = 0; waited < WINDOW_WAIT_LIMIT_MS; waited += WINDOW_POLL_MS) {
		const window = getMainWindow();
		if (window && !window.isDestroyed() && window.isVisible() && !window.webContents.isLoading()) return window;
		await new Promise((resolve) => setTimeout(resolve, WINDOW_POLL_MS));
	}
	return undefined;
}
