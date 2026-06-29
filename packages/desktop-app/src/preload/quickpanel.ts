import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";
import {
	QUICK_PANEL_CHANNELS,
	QUICK_PANEL_SESSION_CHANNELS,
	type QuickPanelBridge,
	type QuickPanelConfigSnapshot,
	type QuickPanelGlassMode,
	type QuickPanelOpenSessionTarget,
	type QuickPanelPendingQuestionChangedEvent,
	type QuickPanelRunningChangedEvent,
	type QuickPanelSession,
} from "../shared/quickpanel-ipc.js";

const api: QuickPanelBridge = {
	getConfig(): Promise<QuickPanelConfigSnapshot> {
		return ipcRenderer.invoke(QUICK_PANEL_CHANNELS.GET_CONFIG);
	},
	createConversation(text: string): Promise<void> {
		return ipcRenderer.invoke(QUICK_PANEL_CHANNELS.CREATE_CONVERSATION, text);
	},
	openSession(target: QuickPanelOpenSessionTarget): Promise<void> {
		return ipcRenderer.invoke(QUICK_PANEL_CHANNELS.OPEN_SESSION, target);
	},
	listRecent(limit?: number): Promise<QuickPanelSession[]> {
		return ipcRenderer.invoke(QUICK_PANEL_CHANNELS.LIST_RECENT, limit);
	},
	hide(): void {
		void ipcRenderer.invoke(QUICK_PANEL_CHANNELS.HIDE);
	},
	onShown(handler: () => void): () => void {
		const listener = (_event: IpcRendererEvent) => {
			handler();
		};
		ipcRenderer.on(QUICK_PANEL_CHANNELS.ON_SHOWN, listener);
		return () => ipcRenderer.removeListener(QUICK_PANEL_CHANNELS.ON_SHOWN, listener);
	},
	onGlass(handler: (mode: QuickPanelGlassMode) => void): () => void {
		const listener = (_event: IpcRendererEvent, mode: QuickPanelGlassMode) => {
			handler(mode);
		};
		ipcRenderer.on(QUICK_PANEL_CHANNELS.ON_GLASS, listener);
		return () => ipcRenderer.removeListener(QUICK_PANEL_CHANNELS.ON_GLASS, listener);
	},
	onRunningChanged(handler: (event: QuickPanelRunningChangedEvent) => void): () => void {
		const listener = (_event: IpcRendererEvent, payload: QuickPanelRunningChangedEvent) => {
			handler(payload);
		};
		ipcRenderer.on(QUICK_PANEL_SESSION_CHANNELS.RUNNING_CHANGED, listener);
		return () => ipcRenderer.removeListener(QUICK_PANEL_SESSION_CHANNELS.RUNNING_CHANGED, listener);
	},
	onPendingQuestionChanged(handler: (event: QuickPanelPendingQuestionChangedEvent) => void): () => void {
		const listener = (_event: IpcRendererEvent, payload: QuickPanelPendingQuestionChangedEvent) => {
			handler(payload);
		};
		ipcRenderer.on(QUICK_PANEL_SESSION_CHANNELS.PENDING_QUESTION_CHANGED, listener);
		return () => ipcRenderer.removeListener(QUICK_PANEL_SESSION_CHANNELS.PENDING_QUESTION_CHANGED, listener);
	},
};

contextBridge.exposeInMainWorld("vettaQuickPanel", api);
