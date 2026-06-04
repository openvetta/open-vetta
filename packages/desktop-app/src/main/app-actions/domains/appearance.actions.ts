import { randomUUID } from "node:crypto";
import { type IpcMainEvent, ipcMain, nativeTheme } from "electron";
import { z } from "zod";
import { getMainWindow } from "../../window-manager.js";
import { type ActionDefinition, ActionError, type JsonValue } from "../types.js";

const themeModeSchema = z.enum(["light", "dark", "auto"]);
const themeActionInputSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("help"),
	}),
	z.object({
		type: z.literal("get"),
	}),
	z
		.object({
			type: z.literal("set"),
			mode: themeModeSchema.optional(),
			themeId: z.string().trim().min(1).optional(),
		})
		.refine((input) => input.mode !== undefined || input.themeId !== undefined, {
			message: "set requires at least one of: mode, themeId.",
		}),
]);
const rendererThemeSnapshotSchema = z.object({
	mode: themeModeSchema,
	themeId: z.string().min(1),
	resolved: z.enum(["light", "dark"]).nullable(),
	appliedThemeId: z.string().nullable(),
});
const rendererThemeResponseSchema = z.object({
	requestId: z.string(),
	state: rendererThemeSnapshotSchema.optional(),
	error: z.string().optional(),
});
const rendererThemeHelpSchema = z.object({
	state: rendererThemeSnapshotSchema,
	themes: z.array(
		z.object({
			id: z.string().min(1),
			label: z.string().min(1),
		}),
	),
});
const rendererThemeHelpResponseSchema = z.object({
	requestId: z.string(),
	help: rendererThemeHelpSchema.optional(),
	error: z.string().optional(),
});

type ThemeMode = z.infer<typeof themeModeSchema>;
type ThemeActionInput = z.infer<typeof themeActionInputSchema>;
type RendererThemeSnapshot = z.infer<typeof rendererThemeSnapshotSchema>;
type RendererThemeHelp = z.infer<typeof rendererThemeHelpSchema>;

function validateThemeActionInput(input: unknown): JsonValue {
	const result = themeActionInputSchema.safeParse(input);
	if (!result.success) {
		throw new ActionError("ACTION_INVALID_INPUT", "Input must match the appearance theme action schema.", {
			issues: result.error.issues.map((issue) => ({
				path: issue.path.map(String).join("."),
				message: issue.message,
			})),
		});
	}
	return result.data as JsonValue;
}

function getNativeThemeInfo(): JsonValue {
	return {
		source: nativeTheme.themeSource,
		shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
	};
}

function getFallbackThemeState(): JsonValue {
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

function waitForRendererThemeResponse(
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

async function getThemeState(): Promise<JsonValue> {
	const renderer = await waitForRendererThemeResponse("vetta:theme:state-requested", "vetta:theme:state-response", {});
	return {
		...renderer,
		native: getNativeThemeInfo(),
		rendererAvailable: true,
		rendererSynced: true,
	};
}

function applyNativeThemeMode(mode: ThemeMode): void {
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

async function getThemeHelp(): Promise<JsonValue> {
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

export function registerAppearanceActions(register: (action: ActionDefinition) => void): void {
	register({
		id: "appearance.theme",
		domain: "appearance",
		title: "读取或设置应用主题",
		summary: "通过 type 字段查看帮助、读取当前主题，或切换浅色/深色/跟随系统模式与多主题风格。",
		availability: "gui-main",
		permission: "appearance.write",
		inputSchema: {
			description:
				'对象参数：{ "type": "help" }、{ "type": "get" } 或 { "type": "set", "mode"?: "light" | "dark" | "auto", "themeId"?: string }。',
		},
		examples: [
			{
				description: "查看可用主题 id 和操作说明",
				input: { type: "help" },
			},
			{
				description: "获取当前主题",
				input: { type: "get" },
			},
			{
				description: "切换到深色默认主题",
				input: { type: "set", mode: "dark", themeId: "default" },
			},
			{
				description: "只切换主题风格",
				input: { type: "set", themeId: "ocean" },
			},
		],
		validateInput: validateThemeActionInput,
		requiresApproval: (input, context) => {
			const request = input as unknown as ThemeActionInput;
			return context.source === "local-server" && request.type === "set";
		},
		run: async (input) => {
			const request = input as unknown as ThemeActionInput;
			if (request.type === "help") {
				return await getThemeHelp();
			}

			if (request.type === "get") {
				const mainWindow = getMainWindow();
				return mainWindow === null ? getFallbackThemeState() : await getThemeState();
			}

			if (request.mode !== undefined) {
				applyNativeThemeMode(request.mode);
			}

			const changeRequest: Record<string, JsonValue> = {};
			if (request.mode !== undefined) changeRequest.mode = request.mode;
			if (request.themeId !== undefined) changeRequest.themeId = request.themeId;
			const mainWindow = getMainWindow();
			if (mainWindow === null) {
				return {
					type: "set",
					requested: changeRequest,
					native: getNativeThemeInfo(),
					rendererAvailable: false,
					rendererSynced: false,
				};
			}
			const renderer = await waitForRendererThemeResponse(
				"vetta:theme:change-requested",
				"vetta:theme:change-response",
				changeRequest,
			);

			return {
				type: "set",
				requested: changeRequest,
				state: renderer,
				native: getNativeThemeInfo(),
				rendererAvailable: true,
				rendererSynced: true,
			};
		},
	});
}
