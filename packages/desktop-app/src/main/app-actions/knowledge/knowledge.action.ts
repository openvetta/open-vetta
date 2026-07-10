import { readDesktopConfig } from "../../ipc/fs.js";
import { isKnowledgeProcessing, retryFailedKnowledge, runKnowledgeRound } from "../../knowledge/poller.js";
import {
	addFilesToKnowledgeBase,
	createKnowledgeBase,
	deleteKnowledgeBase,
	deleteKnowledgeEntry,
	listKnowledgeBases,
	renameKnowledgeBase,
} from "../../knowledge/raws-fs.js";
import { getKnowledgeFileStatuses } from "../../knowledge/status.js";
import { genericApproval, runActionService, toJsonValue } from "../shared.js";
import type { ActionDefinition, ActionExample, ActionInputSchema } from "../types.js";
import {
	type KnowledgeManageInput,
	type KnowledgeQueryInput,
	validateKnowledgeManageInput,
	validateKnowledgeQueryInput,
} from "./knowledge.schema.js";

const queryInputSchema: ActionInputSchema = {
	description: '对象参数；operation 为 "help"、"list"、"statuses" 或 "is-processing"。',
	operations: [
		{
			name: "help",
			description: "返回 knowledge 域说明。",
			parameters: [{ name: "operation", type: '"help"', required: true, description: "固定为 help。" }],
		},
		{
			name: "list",
			description: "列出知识库与文件树。",
			parameters: [{ name: "operation", type: '"list"', required: true, description: "固定为 list。" }],
		},
		{
			name: "statuses",
			description: "列出文件加工态。",
			parameters: [{ name: "operation", type: '"statuses"', required: true, description: "固定为 statuses。" }],
		},
		{
			name: "is-processing",
			description: "当前是否在加工。",
			parameters: [
				{ name: "operation", type: '"is-processing"', required: true, description: "固定为 is-processing。" },
			],
		},
	],
};

const manageInputSchema: ActionInputSchema = {
	description:
		'对象参数；operation 为 "create"、"rename"、"delete"、"add-files"、"delete-entry"、"scan-now" 或 "retry-failed"。加工设置请用 settings.manage set-knowledge-base。',
	operations: [
		{
			name: "create",
			description: "新建知识库。",
			parameters: [
				{ name: "operation", type: '"create"', required: true, description: "固定为 create。" },
				{ name: "name", type: "string", required: true, description: "知识库名。" },
			],
		},
		{
			name: "rename",
			description: "重命名知识库。",
			parameters: [
				{ name: "operation", type: '"rename"', required: true, description: "固定为 rename。" },
				{ name: "name", type: "string", required: true, description: "旧名。" },
				{ name: "newName", type: "string", required: true, description: "新名。" },
			],
		},
		{
			name: "delete",
			description: "删除知识库。",
			parameters: [
				{ name: "operation", type: '"delete"', required: true, description: "固定为 delete。" },
				{ name: "name", type: "string", required: true, description: "知识库名。" },
			],
		},
		{
			name: "add-files",
			description: "导入本地文件到知识库。",
			parameters: [
				{ name: "operation", type: '"add-files"', required: true, description: "固定为 add-files。" },
				{ name: "kbId", type: "string", required: true, description: "知识库 id。" },
				{ name: "paths", type: "string[]", required: true, description: "本地绝对路径。" },
				{ name: "move", type: "boolean", required: false, description: "true 移动源文件，默认 false 复制。" },
			],
		},
		{
			name: "delete-entry",
			description: "删除库内条目。",
			parameters: [
				{ name: "operation", type: '"delete-entry"', required: true, description: "固定为 delete-entry。" },
				{ name: "kbId", type: "string", required: true, description: "知识库 id。" },
				{ name: "relPath", type: "string", required: true, description: "相对路径。" },
			],
		},
		{
			name: "scan-now",
			description: "立即触发一轮加工。",
			parameters: [{ name: "operation", type: '"scan-now"', required: true, description: "固定为 scan-now。" }],
		},
		{
			name: "retry-failed",
			description: "重试失败文件加工。",
			parameters: [
				{ name: "operation", type: '"retry-failed"', required: true, description: "固定为 retry-failed。" },
			],
		},
	],
};

const queryExamples: ActionExample[] = [
	{ description: "列出知识库", input: { operation: "list" } },
	{ description: "查看加工状态", input: { operation: "is-processing" } },
];

const manageExamples: ActionExample[] = [
	{ description: "创建知识库", input: { operation: "create", name: "产品文档" } },
	{ description: "立即加工", input: { operation: "scan-now" } },
	{
		description: "导入文件",
		input: { operation: "add-files", kbId: "default_kb", paths: ["C:\\\\docs\\\\a.pdf"] },
	},
];

export function createKnowledgeActions(): ActionDefinition[] {
	return [
		{
			id: "knowledge.query",
			domain: "knowledge",
			title: "查询知识库",
			summary: "列出知识库、文件加工态或当前是否在加工。",
			availability: "gui-main",
			permission: "knowledge.read",
			keywords: ["知识库", "knowledge", "wiki", "加工", "索引", "raws"],
			inputSchema: queryInputSchema,
			examples: queryExamples,
			validateInput: validateKnowledgeQueryInput,
			run: async (input) => {
				const request = input as unknown as KnowledgeQueryInput;
				if (request.operation === "help") {
					return toJsonValue({
						guidance: "加工模型等设置用 settings.manage set-knowledge-base。",
						actions: [
							{ id: "knowledge.query", inputSchema: queryInputSchema, examples: queryExamples },
							{ id: "knowledge.manage", inputSchema: manageInputSchema, examples: manageExamples },
						],
					});
				}
				if (request.operation === "list") return await runActionService(() => listKnowledgeBases());
				if (request.operation === "statuses") return await runActionService(() => getKnowledgeFileStatuses());
				return toJsonValue({ processing: isKnowledgeProcessing() });
			},
		},
		{
			id: "knowledge.manage",
			domain: "knowledge",
			title: "管理知识库",
			summary: "创建/重命名/删除知识库，导入文件，触发加工。",
			availability: "gui-main",
			permission: "knowledge.write",
			keywords: ["知识库", "导入", "加工", "scan", "knowledge"],
			approval: genericApproval,
			inputSchema: manageInputSchema,
			examples: manageExamples,
			validateInput: validateKnowledgeManageInput,
			requiresApproval: (_input, context) => context.source === "local-server",
			run: async (input) => {
				const request = input as unknown as KnowledgeManageInput;
				return await runActionService(async () => {
					switch (request.operation) {
						case "create":
							await createKnowledgeBase(request.name);
							return { operation: "create", name: request.name };
						case "rename":
							await renameKnowledgeBase(request.name, request.newName);
							return { operation: "rename", name: request.name, newName: request.newName };
						case "delete":
							await deleteKnowledgeBase(request.name);
							return { operation: "delete", name: request.name };
						case "add-files":
							await addFilesToKnowledgeBase(request.kbId, request.paths, request.move);
							return {
								operation: "add-files",
								kbId: request.kbId,
								count: request.paths.length,
								move: request.move,
							};
						case "delete-entry":
							await deleteKnowledgeEntry(request.kbId, request.relPath);
							return { operation: "delete-entry", kbId: request.kbId, relPath: request.relPath };
						case "scan-now": {
							const kb = (await readDesktopConfig()).knowledgeBase;
							return {
								operation: "scan-now",
								...(await runKnowledgeRound(
									kb?.processingModelKey,
									kb?.agentConcurrency ?? 3,
									kb?.processingModelReasoningLevel,
								)),
							};
						}
						case "retry-failed": {
							const kb = (await readDesktopConfig()).knowledgeBase;
							return {
								operation: "retry-failed",
								...(await retryFailedKnowledge(
									kb?.processingModelKey,
									kb?.agentConcurrency ?? 3,
									kb?.processingModelReasoningLevel,
								)),
							};
						}
					}
				});
			},
		},
	];
}
