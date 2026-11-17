// 主窗口的界面缩放。比例持久化在 desktop-config.uiZoomFactor，菜单快捷键与设置页滑块
// 都经 setUiZoomFactor 进来，保证只有一个事实源。只作用于主窗口：快捷面板、桌宠等
// 辅助窗口以及 <webview> 内置浏览器保持各自的大小。

import { BrowserWindow, type WebContents } from "electron";
import {
	normalizeUiZoomFactor,
	parseTitlebarCenter,
	stepUiZoomFactor,
	TITLEBAR_CENTER_FALLBACK,
	trafficLightPositionFor,
	UI_ZOOM_DEFAULT,
} from "../../shared/ui-zoom.js";
import { readConfigSync, updateDesktopConfig } from "../config/desktop-config-store.js";

export const UI_ZOOM_CHANGED_CHANNEL = "vetta:ui-zoom:changed";

let currentFactor: number | undefined;
let mainContents: WebContents | undefined;
/** 渲染进程实测上报的页头中线（CSS px）；红绿灯位置的唯一来源。 */
let titlebarCenter = TITLEBAR_CENTER_FALLBACK;

export function getUiZoomFactor(): number {
	currentFactor ??= normalizeUiZoomFactor(readConfigSync().uiZoomFactor ?? UI_ZOOM_DEFAULT);
	return currentFactor;
}

/** 强制重写时先写入的相邻比例，用来绕开「值没变就不下发」的短路；大于 Chromium 判等的容差。 */
const ZOOM_REWRITE_NUDGE = 0.01;
/** 窗口重新显示后 Chromium 可能稍后才把缩放改回去，所以延后再补一次。 */
const ZOOM_RESHOW_REAPPLY_DELAY_MS = 300;

/**
 * 把当前比例套到主窗口。不能用 getZoomFactor() 判断「是否已经是目标值」：窗口隐藏（Cmd+W）后
 * 再唤起，渲染进程的实际缩放会被 Chromium 改回陈旧值，而 getZoomFactor() 仍返回我们上次设的值，
 * 结果设置页显示 110% 画面却是 100%，只有先拉到别的档位才恢复。
 * 所以这里无条件重写：先写相邻值再写回目标，保证渲染进程收到一次真实变化。两次调用同步完成，
 * 不会产生可见的中间帧。
 */
export function applyUiZoomToWebContents(webContents: WebContents): void {
	if (webContents.isDestroyed()) return;
	const factor = getUiZoomFactor();
	webContents.setZoomFactor(factor + ZOOM_REWRITE_NUDGE);
	webContents.setZoomFactor(factor);
	applyTrafficLightPosition(webContents, factor);
}

/**
 * 红绿灯是原生控件，不随网页缩放；页头中线却跟着比例走，所以比例变化时要把按钮挪到对应位置。
 * 全屏进出、还原、重新显示后系统可能把按钮放回默认位置，调用方在这些时机也要再套一次。
 */
function applyTrafficLightPosition(webContents: WebContents, factor: number): void {
	if (process.platform !== "darwin") return;
	const win = BrowserWindow.fromWebContents(webContents);
	if (!win || win.isDestroyed()) return;
	win.setWindowButtonPosition(trafficLightPositionFor(titlebarCenter, factor));
}

/** 登记主窗口的 webContents：此后比例变化会作用到它，页面加载完成时也会重新套用。 */
export function attachUiZoom(webContents: WebContents): void {
	mainContents = webContents;
	applyUiZoomToWebContents(webContents);
	webContents.on("did-finish-load", () => applyUiZoomToWebContents(webContents));
	const win = BrowserWindow.fromWebContents(webContents);
	const reapply = () => applyTrafficLightPosition(webContents, getUiZoomFactor());
	win?.on("leave-full-screen", reapply);
	// 隐藏后重新显示、最小化还原：缩放可能被 Chromium 改回，连同红绿灯一起重新套用。
	const reapplyZoom = () => {
		applyUiZoomToWebContents(webContents);
		setTimeout(() => applyUiZoomToWebContents(webContents), ZOOM_RESHOW_REAPPLY_DELAY_MS);
	};
	win?.on("restore", reapplyZoom);
	win?.on("show", reapplyZoom);
}

/** 设置比例：夹取、立即生效、广播给所有窗口，再落盘。返回实际生效的比例。 */
export async function setUiZoomFactor(value: unknown): Promise<number> {
	const next = normalizeUiZoomFactor(value);
	if (next === getUiZoomFactor()) {
		// 值没变也重写一次：这是用户在缩放与实际不同步时，重新选同一档就能恢复的出口。
		if (mainContents) applyUiZoomToWebContents(mainContents);
		return next;
	}
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

/** 窗口创建时用：中线还没上报就是兜底值，上报后渲染进程会再校正。 */
export function getInitialTrafficLightPosition(): { x: number; y: number } {
	return trafficLightPositionFor(titlebarCenter, getUiZoomFactor());
}

/** 渲染进程上报页头图标的实测中线（CSS px），立刻把红绿灯对到同一水平线上。 */
export function setTitlebarCenter(value: unknown): void {
	const next = parseTitlebarCenter(value);
	if (next === undefined || next === titlebarCenter) return;
	titlebarCenter = next;
	if (mainContents && !mainContents.isDestroyed()) applyTrafficLightPosition(mainContents, getUiZoomFactor());
}
