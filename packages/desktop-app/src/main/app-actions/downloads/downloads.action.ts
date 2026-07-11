import { cancelDownload, listDownloads } from "../../ipc/downloads.js";
import { createOperationApprovals, runActionService, throwAgentEntityNotFound, toJsonValue } from "../shared.js";
import type { ActionDefinition, ActionExample, ActionInputSchema } from "../types.js";
import {
	type DownloadsManageInput,
	type DownloadsQueryInput,
	validateDownloadsManageInput,
	validateDownloadsQueryInput,
} from "./downloads.schema.js";

const queryInputSchema: ActionInputSchema = {
	description: '对象参数；operation 为 "help" 或 "list"。',
	operations: [
		{
			name: "help",
			description: "返回 downloads 域说明。",
			parameters: [{ name: "operation", type: '"help"', required: true, description: "固定为 help。" }],
		},
		{
			name: "list",
			description: "列出下载任务。",
			parameters: [{ name: "operation", type: '"list"', required: true, description: "固定为 list。" }],
		},
	],
};

const manageInputSchema: ActionInputSchema = {
	description: '对象参数；operation 为 "cancel"。新建下载仍建议走 GUI；本 Action 聚焦查询与取消。',
	operations: [
		{
			name: "cancel",
			description: "取消下载任务。",
			parameters: [
				{ name: "operation", type: '"cancel"', required: true, description: "固定为 cancel。" },
				{ name: "id", type: "string", required: true, description: "下载任务 id。" },
			],
		},
	],
};

const queryExamples: ActionExample[] = [{ description: "列出下载", input: { operation: "list" } }];
const manageExamples: ActionExample[] = [{ description: "取消下载", input: { operation: "cancel", id: "..." } }];

export function createDownloadsActions(): ActionDefinition[] {
	return [
		{
			id: "downloads.query",
			domain: "downloads",
			title: "查询下载任务",
			summary: "列出下载中心任务状态。",
			availability: "gui-main",
			permission: "downloads.read",
			keywords: ["下载", "download", "下载中心"],
			inputSchema: queryInputSchema,
			examples: queryExamples,
			validateInput: validateDownloadsQueryInput,
			run: async (input) => {
				const request = input as unknown as DownloadsQueryInput;
				if (request.operation === "help") {
					return toJsonValue({
						guidance: "下载中心列表与取消；打开页面可用 navigation.open target=downloads。",
						actions: [
							{ id: "downloads.query", inputSchema: queryInputSchema, examples: queryExamples },
							{ id: "downloads.manage", inputSchema: manageInputSchema, examples: manageExamples },
						],
					});
				}
				return toJsonValue({ items: listDownloads() });
			},
		},
		{
			id: "downloads.manage",
			domain: "downloads",
			title: "管理下载任务",
			summary: "取消下载任务。",
			availability: "gui-main",
			permission: "downloads.write",
			keywords: ["下载", "取消下载", "cancel"],
			approval: createOperationApprovals("downloads.cancel", [
				{ id: "downloads.cancel", title: "取消下载确认", description: "展示待取消的下载任务。" },
			]),
			inputSchema: manageInputSchema,
			examples: manageExamples,
			validateInput: validateDownloadsManageInput,
			assertReady: (input) => {
				const request = input as unknown as DownloadsManageInput;
				const items = listDownloads();
				const item = items.find((candidate) => candidate.id === request.id);
				if (!item) {
					throwAgentEntityNotFound({
						operation: "cancel",
						entity: "download task",
						idField: "id",
						id: request.id,
						queryAction: "downloads.query",
						queryExample: { operation: "list" },
						resultIdPath: "items[].id",
						availableIds: items.map((candidate) => candidate.id),
						extra: "Use the download task id, not the filename.",
					});
				}
			},
			requiresApproval: (_input, context) => context.source === "local-server",
			run: async (input) => {
				const request = input as unknown as DownloadsManageInput;
				return await runActionService(() => {
					cancelDownload(request.id);
					return { operation: "cancel", id: request.id };
				});
			},
		},
	];
}
