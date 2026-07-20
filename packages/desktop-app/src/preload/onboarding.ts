import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";
import "./telemetry.js";
import type { HelperPermissions, OnboardingBridge, OnboardingPaneKind } from "../shared/onboarding-ipc.js";

// 通道字面量刻意内联（不 import shared/onboarding-ipc.ts，避免把主进程模块拉进 preload
// 的 Rollup chunk，见 preload/quickpanel.ts 的坑）。与 src/shared/onboarding-ipc.ts 保持一致。
const CHECK_PERMISSIONS = "vetta:onboarding:check-permissions";
const REQUEST_PERMISSIONS = "vetta:onboarding:request-permissions";
const OPEN_PANE = "vetta:permissions:open-pane";
const START_DRAG = "vetta:onboarding:start-drag";
const CLOSE = "vetta:onboarding:close";
const PERMISSIONS_UPDATED = "vetta:onboarding:permissions-updated";
const DRAG_ERROR = "vetta:onboarding:drag-error";

// i18n 通道字面量（与 src/main/ipc/i18n.ts、preload/quickpanel.ts 一致）。
const I18N_GET_INITIAL = "vetta:i18n:get-initial-language";
const I18N_LANGUAGE_CHANGED = "vetta:i18n:language-changed";

// preload 求值期同步取主进程当前语言，供引导窗 i18n 首帧前读取。
// 与 DEFAULT_LANGUAGE 对齐：sendSync 失败时默认英文，勿硬编码 zh。
const initialLanguage = (ipcRenderer.sendSync(I18N_GET_INITIAL) as string | undefined) ?? "en";

const api: OnboardingBridge = {
	initialLanguage,
	checkPermissions(): Promise<HelperPermissions> {
		return ipcRenderer.invoke(CHECK_PERMISSIONS);
	},
	requestPermissions(): Promise<HelperPermissions> {
		return ipcRenderer.invoke(REQUEST_PERMISSIONS);
	},
	openPane(kind: OnboardingPaneKind): Promise<void> {
		return ipcRenderer.invoke(OPEN_PANE, kind);
	},
	startDrag(): void {
		ipcRenderer.send(START_DRAG);
	},
	close(): Promise<void> {
		return ipcRenderer.invoke(CLOSE);
	},
	onPermissionsUpdated(handler: (perms: HelperPermissions) => void): () => void {
		const listener = (_event: IpcRendererEvent, perms: HelperPermissions) => {
			handler(perms);
		};
		ipcRenderer.on(PERMISSIONS_UPDATED, listener);
		return () => ipcRenderer.removeListener(PERMISSIONS_UPDATED, listener);
	},
	onDragError(handler: () => void): () => void {
		const listener = () => {
			handler();
		};
		ipcRenderer.on(DRAG_ERROR, listener);
		return () => ipcRenderer.removeListener(DRAG_ERROR, listener);
	},
	onLanguageChanged(handler: (lang: string) => void): () => void {
		const listener = (_event: IpcRendererEvent, lang: string) => {
			handler(lang);
		};
		ipcRenderer.on(I18N_LANGUAGE_CHANGED, listener);
		return () => ipcRenderer.removeListener(I18N_LANGUAGE_CHANGED, listener);
	},
};

contextBridge.exposeInMainWorld("vettaOnboarding", api);
