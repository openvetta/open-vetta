import { readDesktopConfig, writeDesktopConfig } from "../../ipc/fs.js";
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
import { createOperationApprovals, runActionService, throwAgentEntityNotFound, toJsonValue } from "../shared.js";
import type { ActionDefinition, ActionExample, ActionInputSchema } from "../types.js";
import {
	type KnowledgeManageInput,
	type KnowledgeQueryInput,
	validateKnowledgeManageInput,
	validateKnowledgeQueryInput,
} from "./knowledge.schema.js";

const queryInputSchema: ActionInputSchema = {
	description:
		'对象参数；operation 为 "help"、"list"、"statuses"、"is-processing" 或 "get-processing"（加工策略配置）。',
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
		{
			name: "get-processing",
			description: "读取知识库加工策略（开关、间隔、整理模型、并发等）。",
			parameters: [
				{ name: "operation", type: '"get-processing"', required: true, description: "固定为 get-processing。" },
			],
		},
	],
};

const manageInputSchema: ActionInputSchema = {
	description:
		'对象参数；operation 为 "create"、"rename"、"delete"、"add-files"、"delete-entry"、"scan-now"、"retry-failed" 或 "set-processing"（加工策略 patch）。',
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
		{
			name: "set-processing",
			description: "patch 知识库加工策略（对应设置 → 知识库）。",
			parameters: [
				{ name: "operation", type: '"set-processing"', required: true, description: "固定为 set-processing。" },
				{
					name: "data",
					type: "object",
					required: true,
					description:
						"enabled / pollIntervalMinutes / processingModelKey / processingModelReasoningLevel / agentConcurrency / ocrConcurrency；null 表示清空模型字段。",
				},
			],
		},
	],
};

const queryExamples: ActionExample[] = [
	{ description: "列出知识库", input: { operation: "list" } },
	{ description: "查看加工状态", input: { operation: "is-processing" } },
	{ description: "读取加工策略配置", input: { operation: "get-processing" } },
];

const manageExamples: ActionExample[] = [
	{ description: "创建知识库", input: { operation: "create", name: "产品文档" } },
	{ description: "立即加工", input: { operation: "scan-now" } },
	{
		description: "导入文件",
		input: { operation: "add-files", kbId: "default_kb", paths: ["C:\\\\docs\\\\a.pdf"] },
	},
	{ description: "开启知识库加工", input: { operation: "set-processing", data: { enabled: true } } },
];

export function createKnowledgeActions(): ActionDefinition[] {
	return [
		{
			id: "knowledge.query",
			domain: "knowledge",
			title: "查询知识库",
			summary: "列出知识库、文件加工态、是否在加工，以及加工策略配置。",
			availability: "gui-main",
			permission: "knowledge.read",
			keywords: ["知识库", "knowledge", "wiki", "加工", "索引", "raws", "整理模型", "processing"],
			inputSchema: queryInputSchema,
			examples: queryExamples,
			validateInput: validateKnowledgeQueryInput,
			run: async (input) => {
				const request = input as unknown as KnowledgeQueryInput;
				if (request.operation === "help") {
					return toJsonValue({
						guidance:
							"知识库实体与加工策略都在 knowledge.*。set-processing 对应设置 → 知识库；list/add-files 管理库与文件。",
						actions: [
							{ id: "knowledge.query", inputSchema: queryInputSchema, examples: queryExamples },
							{ id: "knowledge.manage", inputSchema: manageInputSchema, examples: manageExamples },
						],
					});
				}
				if (request.operation === "list") return await runActionService(() => listKnowledgeBases());
				if (request.operation === "statuses") return await runActionService(() => getKnowledgeFileStatuses());
				if (request.operation === "get-processing") {
					const config = await readDesktopConfig();
					return toJsonValue({ knowledgeBase: config.knowledgeBase ?? {} });
				}
				return toJsonValue({ processing: isKnowledgeProcessing() });
			},
		},
		{
			id: "knowledge.manage",
			domain: "knowledge",
			title: "管理知识库",
			summary: "创建/重命名/删除知识库，导入文件，触发加工，以及修改加工策略。",
			availability: "gui-main",
			permission: "knowledge.write",
			keywords: ["知识库", "导入", "加工", "scan", "knowledge", "整理", "processing", "模型"],
			approval: createOperationApprovals("knowledge.create", [
				{ id: "knowledge.create", title: "创建知识库确认", description: "展示并可编辑知识库名称。" },
				{ id: "knowledge.rename", title: "重命名知识库确认", description: "展示并可编辑新名称。" },
				{ id: "knowledge.delete", title: "删除知识库确认", description: "展示待删除知识库。" },
				{ id: "knowledge.add-files", title: "添加知识库文件确认", description: "展示待添加文件列表。" },
				{ id: "knowledge.delete-entry", title: "删除知识库条目确认", description: "展示待删除条目。" },
				{ id: "knowledge.scan-now", title: "立即整理知识库确认", description: "确认触发整理。" },
				{ id: "knowledge.retry-failed", title: "重试失败知识库任务确认", description: "确认重试失败任务。" },
				{ id: "knowledge.set-processing", title: "修改知识库加工设置确认", description: "确认加工策略变更。" },
			]),
			inputSchema: manageInputSchema,
			examples: manageExamples,
			validateInput: validateKnowledgeManageInput,
			assertReady: async (input) => {
				const request = input as unknown as KnowledgeManageInput;
				// create / scan-now / retry-failed / set-processing 不要求指定库已存在于参数中。
				if (
					request.operation === "create" ||
					request.operation === "scan-now" ||
					request.operation === "retry-failed" ||
					request.operation === "set-processing"
				) {
					return;
				}
				const bases = await listKnowledgeBases();
				const names = bases.map((item) => item.name);
				const ids = bases.map((item) => item.id);
				if (request.operation === "rename" || request.operation === "delete") {
					if (!names.includes(request.name)) {
						throwAgentEntityNotFound({
							operation: request.operation,
							entity: "knowledge base",
							idField: "name",
							id: request.name,
							queryAction: "knowledge.query",
							queryExample: { operation: "list" },
							resultIdPath: "list result array items[].name",
							availableIds: names,
						});
					}
					return;
				}
				// add-files / delete-entry 用 kbId
				if (!ids.includes(request.kbId)) {
					throwAgentEntityNotFound({
						operation: request.operation,
						entity: "knowledge base",
						idField: "kbId",
						id: request.kbId,
						queryAction: "knowledge.query",
						queryExample: { operation: "list" },
						resultIdPath: "list result array items[].id",
						availableIds: ids,
						extra: "kbId is the knowledge base directory id from list, usually same as name.",
					});
				}
			},
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
						case "set-processing": {
							const config = await readDesktopConfig();
							const kb = { ...config.knowledgeBase };
							const data = request.data;
							if (data.enabled !== undefined) kb.enabled = data.enabled;
							if (data.pollIntervalMinutes !== undefined) kb.pollIntervalMinutes = data.pollIntervalMinutes;
							if (data.processingModelKey === null) delete kb.processingModelKey;
							else if (data.processingModelKey !== undefined) kb.processingModelKey = data.processingModelKey;
							if (data.processingModelReasoningLevel === null) delete kb.processingModelReasoningLevel;
							else if (data.processingModelReasoningLevel !== undefined) {
								kb.processingModelReasoningLevel = data.processingModelReasoningLevel;
							}
							if (data.agentConcurrency !== undefined) kb.agentConcurrency = data.agentConcurrency;
							if (data.ocrConcurrency !== undefined) kb.ocrConcurrency = data.ocrConcurrency;
							config.knowledgeBase = kb;
							await writeDesktopConfig(config);
							return { operation: "set-processing", knowledgeBase: kb };
						}
					}
				});
			},
		},
	];
}
