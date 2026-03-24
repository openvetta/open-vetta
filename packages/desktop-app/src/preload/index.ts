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
		selectImages: async () => ipcRenderer.invoke("vetta:dialog:select-images"),
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
		installFromMarket: async (name: string, archiveBuffer: ArrayBuffer) =>
			ipcRenderer.invoke("vetta:skills:install-from-market", name, archiveBuffer),
		uninstall: async (name: string) => ipcRenderer.invoke("vetta:skills:uninstall", name),
		getMarketManifest: async () => ipcRenderer.invoke("vetta:skills:get-market-manifest"),
	},
	config: {
		get: async () => ipcRenderer.invoke("vetta:config:get"),
		set: async (config) => ipcRenderer.invoke("vetta:config:set", config),
	},
	models: {
		get: async () => ipcRenderer.invoke("vetta:models:get"),
		set: async (config) => ipcRenderer.invoke("vetta:models:set", config),
		fetchRemote: async () => ipcRenderer.invoke("vetta:models:fetch-remote"),
	},
	mcp: {
		get: async () => ipcRenderer.invoke("vetta:mcp:get"),
		set: async (config) => ipcRenderer.invoke("vetta:mcp:set", config),
	},
	settings: {
		getServerUrl: async () => ipcRenderer.invoke("vetta:settings:get-server-url"),
		getServerToken: async () => ipcRenderer.invoke("vetta:settings:get-server-token"),
		setServerToken: async (token) => ipcRenderer.invoke("vetta:settings:set-server-token", token),
	},
	shell: {
		showInFolder: async (fullPath) => ipcRenderer.invoke("vetta:shell:show-in-folder", fullPath),
	},
	window: {
		minimize: async () => ipcRenderer.invoke("vetta:window:minimize"),
		maximize: async () => ipcRenderer.invoke("vetta:window:maximize"),
		close: async () => ipcRenderer.invoke("vetta:window:close"),
		isMaximized: async () => ipcRenderer.invoke("vetta:window:is-maximized"),
	},
	auth: {
		openExternal: async (url) => ipcRenderer.invoke("vetta:auth:open-external", url),
		onOAuthCallback: (handler) => {
			const listener = (_event: Electron.IpcRendererEvent, data: { token: string }) => {
				handler(data);
			};
			ipcRenderer.on("vetta:auth:oauth-callback", listener);
			return () => {
				ipcRenderer.removeListener("vetta:auth:oauth-callback", listener);
			};
		},
	},
	updater: {
		check: async () => ipcRenderer.invoke("vetta:updater:check"),
		getCurrentVersion: async () => ipcRenderer.invoke("vetta:updater:get-current-version"),
		download: async (url) => ipcRenderer.invoke("vetta:updater:download", url),
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
