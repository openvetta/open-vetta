// 快捷面板「双击功能键」全局触发器。
// Electron globalShortcut 无法监听裸功能键的双击，这里用 uiohook-napi 做原生全局键盘监听，
// 在 main 进程检测「干净双击」并回调唤出面板。默认 trigger=none 时不启动监听（不申请权限/无开销）。
// macOS 首次启动监听会触发系统「输入监控」授权；未授权时收不到事件——设置页有提示。

import { UiohookKey, uIOhook } from "uiohook-napi";
import type { QuickPanelTrigger } from "./ipc/fs.js";
import { getAppLogger } from "./logger.js";

const log = getAppLogger("quickpanel-trigger");

/** 两次干净点按的最大间隔（ms）。 */
const DOUBLE_TAP_MS = 350;

/** 触发对应的 uiohook keycode 集合（含左右两侧）。mod 按平台映射：mac=⌘，其余=Ctrl。 */
function keycodesFor(trigger: Exclude<QuickPanelTrigger, "none">): number[] {
	switch (trigger) {
		case "mod":
			return process.platform === "darwin"
				? [UiohookKey.Meta, UiohookKey.MetaRight]
				: [UiohookKey.Ctrl, UiohookKey.CtrlRight];
		case "alt":
			return [UiohookKey.Alt, UiohookKey.AltRight];
		case "shift":
			return [UiohookKey.Shift, UiohookKey.ShiftRight];
	}
}

let started = false;
let listenersBound = false;
let targets = new Set<number>();
let onTrigger: (() => void) | null = null;

// 单次「干净点按」检测状态：目标功能键按下→抬起、且期间没有按过其它键。
let modifierDown = false;
let pressedOtherDuringPress = false;
let lastCleanTapAt = 0;

function resetState(): void {
	modifierDown = false;
	pressedOtherDuringPress = false;
	lastCleanTapAt = 0;
}

function handleKeydown(e: { keycode: number }): void {
	if (targets.has(e.keycode)) {
		modifierDown = true;
		pressedOtherDuringPress = false;
	} else {
		// 任意非目标键：作废本次按压，并打断双击序列（避免打字途中误触发）。
		pressedOtherDuringPress = true;
		lastCleanTapAt = 0;
	}
}

function handleKeyup(e: { keycode: number }): void {
	if (!targets.has(e.keycode) || !modifierDown) return;
	modifierDown = false;
	if (pressedOtherDuringPress) return; // 组合键（如 ⌘C）不算点按
	const now = Date.now();
	if (lastCleanTapAt && now - lastCleanTapAt <= DOUBLE_TAP_MS) {
		lastCleanTapAt = 0;
		try {
			onTrigger?.();
		} catch (err) {
			log.error("trigger callback failed", err);
		}
	} else {
		lastCleanTapAt = now;
	}
}

function ensureListeners(): void {
	if (listenersBound) return;
	uIOhook.on("keydown", handleKeydown);
	uIOhook.on("keyup", handleKeyup);
	listenersBound = true;
}

/** 设定双击触发回调（唤出/切换面板）。在 main 启动时调用一次。 */
export function setQuickPanelTriggerHandler(handler: () => void): void {
	onTrigger = handler;
}

/** 依据配置启停原生监听：none 停止；其它启动并设定目标功能键。设置变更后再次调用即可热切换。 */
export function applyQuickPanelTrigger(trigger: QuickPanelTrigger): void {
	resetState();
	if (trigger === "none") {
		targets = new Set();
		stopQuickPanelTrigger();
		return;
	}
	targets = new Set(keycodesFor(trigger));
	ensureListeners();
	if (!started) {
		try {
			uIOhook.start();
			started = true;
			log.info("uiohook started", { trigger });
		} catch (err) {
			log.error("failed to start uiohook (检查 macOS 输入监控权限)", err);
		}
	} else {
		log.info("quick panel trigger changed", { trigger });
	}
}

/** 停止原生监听（退出 APP 或关闭功能时）。 */
export function stopQuickPanelTrigger(): void {
	if (!started) return;
	try {
		uIOhook.stop();
	} catch (err) {
		log.warn("failed to stop uiohook", err);
	}
	started = false;
	log.info("uiohook stopped");
}
