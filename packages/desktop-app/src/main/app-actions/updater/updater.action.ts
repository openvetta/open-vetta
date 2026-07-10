import { getAppVersion, updaterService } from "../../updater.js";
import { genericApproval, runActionService, toJsonValue } from "../shared.js";
import type { ActionDefinition, ActionExample, ActionInputSchema } from "../types.js";
import {
	type UpdaterManageInput,
	type UpdaterQueryInput,
	validateUpdaterManageInput,
	validateUpdaterQueryInput,
} from "./updater.schema.js";

const queryInputSchema: ActionInputSchema = {
	description: '对象参数；operation 为 "help"、"state" 或 "version"。',
	operations: [
		{
			name: "help",
			description: "返回 updater 域说明。",
			parameters: [{ name: "operation", type: '"help"', required: true, description: "固定为 help。" }],
		},
		{
			name: "state",
			description: "读取更新器状态。",
			parameters: [{ name: "operation", type: '"state"', required: true, description: "固定为 state。" }],
		},
		{
			name: "version",
			description: "读取当前应用版本。",
			parameters: [{ name: "operation", type: '"version"', required: true, description: "固定为 version。" }],
		},
	],
};

const manageInputSchema: ActionInputSchema = {
	description:
		'对象参数；operation 为 "check"、"download"、"install"、"dismiss" 或 "cancel"。install 会重启应用。check 需要已登录。',
	operations: [
		{
			name: "check",
			description: "检查更新。",
			parameters: [{ name: "operation", type: '"check"', required: true, description: "固定为 check。" }],
		},
		{
			name: "download",
			description: "下载已发现的更新。",
			parameters: [{ name: "operation", type: '"download"', required: true, description: "固定为 download。" }],
		},
		{
			name: "install",
			description: "安装更新并重启。",
			parameters: [{ name: "operation", type: '"install"', required: true, description: "固定为 install。" }],
		},
		{
			name: "dismiss",
			description: "稍后提醒。",
			parameters: [{ name: "operation", type: '"dismiss"', required: true, description: "固定为 dismiss。" }],
		},
		{
			name: "cancel",
			description: "取消下载。",
			parameters: [{ name: "operation", type: '"cancel"', required: true, description: "固定为 cancel。" }],
		},
	],
};

const queryExamples: ActionExample[] = [
	{ description: "查看更新状态", input: { operation: "state" } },
	{ description: "当前版本", input: { operation: "version" } },
];

const manageExamples: ActionExample[] = [
	{ description: "检查更新", input: { operation: "check" } },
	{ description: "安装并重启", input: { operation: "install" } },
];

export function createUpdaterActions(): ActionDefinition[] {
	return [
		{
			id: "updater.query",
			domain: "updater",
			title: "查询应用更新",
			summary: "读取更新器状态与当前版本。",
			availability: "gui-main",
			permission: "updater.read",
			keywords: ["更新", "update", "版本", "version", "升级"],
			inputSchema: queryInputSchema,
			examples: queryExamples,
			validateInput: validateUpdaterQueryInput,
			run: async (input) => {
				const request = input as unknown as UpdaterQueryInput;
				if (request.operation === "help") {
					return toJsonValue({
						guidance: "install 会重启应用；请先 check/download 到 ready 再 install。",
						actions: [
							{ id: "updater.query", inputSchema: queryInputSchema, examples: queryExamples },
							{ id: "updater.manage", inputSchema: manageInputSchema, examples: manageExamples },
						],
					});
				}
				if (request.operation === "version") {
					return toJsonValue({ version: getAppVersion() });
				}
				return toJsonValue(updaterService.getState());
			},
		},
		{
			id: "updater.manage",
			domain: "updater",
			title: "管理应用更新",
			summary: "检查、下载、安装更新或取消/稍后。",
			availability: "gui-main",
			permission: "updater.write",
			keywords: ["更新", "安装更新", "检查更新", "upgrade"],
			approval: genericApproval,
			inputSchema: manageInputSchema,
			examples: manageExamples,
			validateInput: validateUpdaterManageInput,
			requiresApproval: (_input, context) => context.source === "local-server",
			run: async (input) => {
				const request = input as unknown as UpdaterManageInput;
				return await runActionService(async () => {
					switch (request.operation) {
						case "check":
							return { operation: "check", state: await updaterService.check() };
						case "download":
							await updaterService.startDownload();
							return { operation: "download", state: updaterService.getState() };
						case "install":
							await updaterService.install();
							return { operation: "install", state: updaterService.getState() };
						case "dismiss":
							updaterService.dismissReady();
							return { operation: "dismiss", state: updaterService.getState() };
						case "cancel":
							updaterService.cancel();
							return { operation: "cancel", state: updaterService.getState() };
					}
				});
			},
		},
	];
}
