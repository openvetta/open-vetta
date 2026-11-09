// 主窗口的界面缩放。比例持久化在 desktop-config.uiZoomFactor，菜单快捷键与设置页滑块
// 都经 setUiZoomFactor 进来，保证只有一个事实源。只作用于主窗口：快捷面板、桌宠等
// 辅助窗口以及 <webview> 内置浏览器保持各自的大小。

import { BrowserWindow, type WebContents } from "electron";
import { normalizeUiZoomFactor, stepUiZoomFactor, UI_ZOOM_DEFAULT } from "../../shared/ui-zoom.js";
import { readConfigSync, updateDesktopConfig } from "../config/desktop-config-store.js";

export const UI_ZOOM_CHANGED_CHANNEL = "vetta:ui-zoom:changed";

let currentFactor: number | undefined;
let mainContents: WebContents | undefined;

export function getUiZoomFactor(): number {
	currentFactor ??= normalizeUiZoomFactor(readConfigSync().uiZoomFactor ?? UI_ZOOM_DEFAULT);
	return currentFactor;
}

/**
 * 把当前比例套到主窗口。Chromium 的缩放跟 origin 走，页面重新加载后可能回到它自己记的值，
 * 所以窗口创建与每次 did-finish-load 都要重新套一次。
 */
export function applyUiZoomToWebContents(webContents: WebContents): void {
	if (webContents.isDestroyed()) return;
	const factor = getUiZoomFactor();
	if (webContents.getZoomFactor() !== factor) webContents.setZoomFactor(factor);
}

/** 登记主窗口的 webContents：此后比例变化会作用到它，页面加载完成时也会重新套用。 */
export function attachUiZoom(webContents: WebContents): void {
	mainContents = webContents;
	applyUiZoomToWebContents(webContents);
	webContents.on("did-finish-load", () => applyUiZoomToWebContents(webContents));
}

/** 设置比例：夹取、立即生效、广播给所有窗口，再落盘。返回实际生效的比例。 */
export async function setUiZoomFactor(value: unknown): Promise<number> {
	const next = normalizeUiZoomFactor(value);
	if (next === getUiZoomFactor()) return next;
	currentFactor = next;
	if (mainContents) applyUiZoomToWebContents(mainContents);
	for (const win of BrowserWindow.getAllWindows()) {
		if (!win.isDestroyed()) win.webContents.send(UI_ZOOM_CHANGED_CHANNEL, next);
	}
	await updateDesktopConfig((config) => ({ ...config, uiZoomFactor: next }));
	return next;
}

export function stepUiZoom(direction: 1 | -1): Promise<number> {
	return setUiZoomFactor(stepUiZoomFactor(getUiZoomFactor(), direction));
}

export function resetUiZoom(): Promise<number> {
	return setUiZoomFactor(UI_ZOOM_DEFAULT);
}
