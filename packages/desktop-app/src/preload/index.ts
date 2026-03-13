import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi } from "./api.js";

const CHANNELS = {
	CREATE: "vetta:session:create",
	PROMPT: "vetta:session:prompt",
	CONTINUE: "vetta:session:continue",
	ABORT: "vetta:session:abort",
	SUBSCRIBE: "vetta:session:subscribe",
	UNSUBSCRIBE: "vetta:session:unsubscribe",
	UPDATE_SETTINGS: "vetta:session:update-settings",
	GET_STATE: "vetta:session:get-state",
	EVENT: "vetta:session:event",
} as const;

const api: DesktopApi = {
	session: {
		create: async (config) => ipcRenderer.invoke(CHANNELS.CREATE, config),
		prompt: async (sessionId, request) => ipcRenderer.invoke(CHANNELS.PROMPT, sessionId, request),
		continue: async (sessionId) => ipcRenderer.invoke(CHANNELS.CONTINUE, sessionId),
		abort: async (sessionId) => ipcRenderer.invoke(CHANNELS.ABORT, sessionId),
		subscribe: async (sessionId, handler) => {
			const { subscriptionId } = await ipcRenderer.invoke(CHANNELS.SUBSCRIBE, sessionId);
			const listener = (_event: Electron.IpcRendererEvent, incomingId: string, runtimeEvent: unknown) => {
				if (incomingId === subscriptionId) {
					handler(runtimeEvent as Parameters<typeof handler>[0]);
				}
			};
			ipcRenderer.on(CHANNELS.EVENT, listener);
			return () => {
				ipcRenderer.removeListener(CHANNELS.EVENT, listener);
				void ipcRenderer.invoke(CHANNELS.UNSUBSCRIBE, subscriptionId);
			};
		},
		updateSettings: async (sessionId, partialSettings) =>
			ipcRenderer.invoke(CHANNELS.UPDATE_SETTINGS, sessionId, partialSettings),
		getState: async (sessionId) => ipcRenderer.invoke(CHANNELS.GET_STATE, sessionId),
	},
};

contextBridge.exposeInMainWorld("vetta", api);
