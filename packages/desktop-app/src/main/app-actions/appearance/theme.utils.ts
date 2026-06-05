import { randomUUID } from "node:crypto";
import { type IpcMainEvent, ipcMain, nativeTheme } from "electron";
import { getMainWindow } from "../../window-manager.js";
import { ActionError, type JsonValue } from "../types.js";
import {
	type RendererThemeHelp,
	type RendererThemeSnapshot,
	rendererThemeHelpResponseSchema,
	rendererThemeResponseSchema,
	type ThemeMode,
} from "./theme.schema.js";

export function getNativeThemeInfo(): JsonValue {
	return {
		source: nativeTheme.themeSource,
		shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
	};
}

export function getFallbackThemeState(): JsonValue {
	return {
		mode: nativeTheme.themeSource === "system" ? "auto" : nativeTheme.themeSource,
		themeId: "default",
		resolved: nativeTheme.shouldUseDarkColors ? "dark" : "light",
		appliedThemeId: null,
		native: getNativeThemeInfo(),
		rendererAvailable: false,
		rendererSynced: false,
	};
}

export function waitForRendererThemeResponse(
	requestChannel: "vetta:theme:state-requested" | "vetta:theme:change-requested",
	responseChannel: "vetta:theme:state-response" | "vetta:theme:change-response",
	payload: JsonValue,
): Promise<RendererThemeSnapshot> {
	const mainWindow = getMainWindow();
	if (mainWindow === null) {
		throw new ActionError("ACTION_UNAVAILABLE", "Main renderer window is not available.");
	}

	const requestId = randomUUID();
	const message = { ...(payload as object), requestId };

	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			ipcMain.removeListener(responseChannel, listener);
			reject(new ActionError("ACTION_TIMEOUT", "Timed out waiting for renderer theme response."));
		}, 2000);

		const listener = (event: IpcMainEvent, data: unknown) => {
			if (event.sender !== mainWindow.webContents) return;
			const response = rendererThemeResponseSchema.safeParse(data);
			if (!response.success || response.data.requestId !== requestId) return;

			clearTimeout(timeout);
			ipcMain.removeListener(responseChannel, listener);

			if (response.data.error) {
				reject(new ActionError("ACTION_RENDERER_ERROR", response.data.error));
				return;
			}
			if (response.data.state === undefined) {
				reject(new ActionError("ACTION_RENDERER_ERROR", "Renderer theme response is missing state."));
				return;
			}
			resolve(response.data.state);
		};

		ipcMain.on(responseChannel, listener);
		mainWindow.webContents.send(requestChannel, message);
	});
}

function waitForRendererThemeHelp(): Promise<RendererThemeHelp> {
	const mainWindow = getMainWindow();
	if (mainWindow === null) {
		throw new ActionError("ACTION_UNAVAILABLE", "Main renderer window is not available.");
	}

	const requestId = randomUUID();

	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			ipcMain.removeListener("vetta:theme:help-response", listener);
			reject(new ActionError("ACTION_TIMEOUT", "Timed out waiting for renderer theme help."));
		}, 2000);

		const listener = (event: IpcMainEvent, data: unknown) => {
			if (event.sender !== mainWindow.webContents) return;
			const response = rendererThemeHelpResponseSchema.safeParse(data);
			if (!response.success || response.data.requestId !== requestId) return;

			clearTimeout(timeout);
			ipcMain.removeListener("vetta:theme:help-response", listener);

			if (response.data.error) {
				reject(new ActionError("ACTION_RENDERER_ERROR", response.data.error));
				return;
			}
			if (response.data.help === undefined) {
				reject(new ActionError("ACTION_RENDERER_ERROR", "Renderer theme help response is missing help."));
				return;
			}
			resolve(response.data.help);
		};

		ipcMain.on("vetta:theme:help-response", listener);
		mainWindow.webContents.send("vetta:theme:help-requested", { requestId });
	});
}

export async function getThemeState(): Promise<JsonValue> {
	const renderer = await waitForRendererThemeResponse("vetta:theme:state-requested", "vetta:theme:state-response", {});
	return {
		...renderer,
		native: getNativeThemeInfo(),
		rendererAvailable: true,
		rendererSynced: true,
	};
}

export function applyNativeThemeMode(mode: ThemeMode): void {
	nativeTheme.themeSource = mode === "auto" ? "system" : mode;
}

function getFallbackThemeHelp(): Record<string, JsonValue> {
	return {
		type: "help",
		description: "appearance.theme 用一个 JSON 对象通过 type 字段选择主题操作。",
		operations: [
			{
				type: "help",
				description: "返回可用操作、mode 取值和当前 renderer 已注册的 themeId 列表。",
				input: { type: "help" },
			},
			{
				type: "get",
				description: "读取当前主题模式、主题风格、解析后的亮暗模式和原生主题信息。",
				input: { type: "get" },
			},
			{
				type: "set",
				description: "设置主题。mode 控制 light/dark/auto，themeId 控制具体主题风格；两者可单独或同时传入。",
				input: { type: "set", mode: "dark", themeId: "default" },
			},
		],
		modes: [
			{ value: "light", description: "固定浅色模式。" },
			{ value: "dark", description: "固定深色模式。" },
			{ value: "auto", description: "跟随系统外观。" },
		],
		themes: [],
		state: getFallbackThemeState(),
		native: getNativeThemeInfo(),
		rendererAvailable: false,
		rendererSynced: false,
	};
}

export async function getThemeHelp(): Promise<JsonValue> {
	const mainWindow = getMainWindow();
	if (mainWindow === null) return getFallbackThemeHelp();

	const help = await waitForRendererThemeHelp();
	return {
		...getFallbackThemeHelp(),
		themes: help.themes,
		state: help.state,
		native: getNativeThemeInfo(),
		rendererAvailable: true,
		rendererSynced: true,
	};
}
