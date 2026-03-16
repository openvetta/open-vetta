import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi } from "./api.js";

const CHANNELS = {
	CREATE: "vetta:session:create",
	LIST_PROJECTS: "vetta:session:list-projects",
	LIST_SESSIONS: "vetta:session:list-sessions",
	PROMPT: "vetta:session:prompt",
	CONTINUE: "vetta:session:continue",
	ABORT: "vetta:session:abort",
	SUBSCRIBE: "vetta:session:subscribe",
	UNSUBSCRIBE: "vetta:session:unsubscribe",
	UPDATE_SETTINGS: "vetta:session:update-settings",
	GET_STATE: "vetta:session:get-state",
	GET_MESSAGES: "vetta:session:get-messages",
	DELETE: "vetta:session:delete",
	RENAME: "vetta:session:rename",
	EVENT: "vetta:session:event",
} as const;

const api: DesktopApi = {
	dialog: {
		selectFolder: async () => ipcRenderer.invoke("vetta:dialog:select-folder"),
	},
	theme: {
		set: async (mode) => ipcRenderer.invoke("vetta:theme:set", mode),
		getNative: async () => ipcRenderer.invoke("vetta:theme:get-native"),
		onNativeChanged: (handler) => {
			const listener = (_event: Electron.IpcRendererEvent, info: { shouldUseDarkColors: boolean }) => {
				handler(info);
			};
			ipcRenderer.on("vetta:theme:native-changed", listener);
			return () => {
				ipcRenderer.removeListener("vetta:theme:native-changed", listener);
			};
		},
	},
	fs: {
		readDir: async (dirPath) => ipcRenderer.invoke("vetta:fs:read-dir", dirPath),
		readFile: async (filePath) => ipcRenderer.invoke("vetta:fs:read-file", filePath),
		rename: async (oldPath, newPath) => ipcRenderer.invoke("vetta:fs:rename", oldPath, newPath),
		delete: async (targetPath) => ipcRenderer.invoke("vetta:fs:delete", targetPath),
		move: async (sourcePath, destDir) => ipcRenderer.invoke("vetta:fs:move", sourcePath, destDir),
		createDirectory: async (dirPath) => ipcRenderer.invoke("vetta:fs:create-directory", dirPath),
		listSubDirs: async (dirPath) => ipcRenderer.invoke("vetta:fs:list-sub-dirs", dirPath),
	},
	skills: {
		list: async () => ipcRenderer.invoke("vetta:skills:list"),
	},
	config: {
		get: async () => ipcRenderer.invoke("vetta:config:get"),
		set: async (config) => ipcRenderer.invoke("vetta:config:set", config),
	},
	models: {
		get: async () => ipcRenderer.invoke("vetta:models:get"),
		set: async (config) => ipcRenderer.invoke("vetta:models:set", config),
	},
	session: {
		create: async (config) => ipcRenderer.invoke(CHANNELS.CREATE, config),
		listProjects: async () => ipcRenderer.invoke(CHANNELS.LIST_PROJECTS),
		listSessions: async (cwd) => ipcRenderer.invoke(CHANNELS.LIST_SESSIONS, cwd),
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
		getMessages: async (sessionId) => ipcRenderer.invoke(CHANNELS.GET_MESSAGES, sessionId),
		delete: async (sessionPath) => ipcRenderer.invoke(CHANNELS.DELETE, sessionPath),
		rename: async (sessionPath, name) => ipcRenderer.invoke(CHANNELS.RENAME, sessionPath, name),
	},
};

contextBridge.exposeInMainWorld("vetta", api);
