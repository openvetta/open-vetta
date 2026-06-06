import { getAppLogger } from "../../logger.js";
import {
	type CreateScheduledTaskInput,
	type SchedulerService,
	SchedulerServiceError,
	type UpdateScheduledTaskInput,
} from "../../scheduler/scheduler-service.js";
import {
	type ActionApprovalMetadata,
	type ActionDefinition,
	ActionError,
	type ActionExample,
	type ActionInputSchema,
	type JsonValue,
} from "../types.js";

const log = getAppLogger("action-scheduler");

import {
	type SchedulerExecutionInput,
	type SchedulerQueryInput,
	type SchedulerTaskInput,
	validateSchedulerExecutionInput,
	validateSchedulerQueryInput,
	validateSchedulerTaskInput,
} from "./scheduler.schema.js";

const taskApproval: ActionApprovalMetadata = {
	defaultPresentation: "scheduler.create",
	presentations: [
		{
			id: "scheduler.create",
			title: "创建定时任务确认",
			description: "展示待创建的定时任务详情，由用户确认是否创建。",
		},
		{
			id: "scheduler.update",
			title: "更新定时任务确认",
			description: "展示定时任务的变更内容，由用户确认是否更新。",
		},
		{
			id: "scheduler.delete",
			title: "删除定时任务确认",
			description: "展示待删除的定时任务信息，由用户确认是否删除。",
		},
		{
			id: "scheduler.toggle",
			title: "启用/停用定时任务确认",
			description: "展示定时任务的启用状态变更，由用户确认。",
		},
	],
};

const executionApproval: ActionApprovalMetadata = {
	defaultPresentation: "scheduler.run-now",
	presentations: [
		{
			id: "scheduler.run-now",
			title: "立即执行定时任务确认",
			description: "展示待执行的定时任务信息，由用户确认是否立即执行。",
		},
		{
			id: "scheduler.abort",
			title: "中止定时任务确认",
			description: "展示运行中的定时任务信息，由用户确认是否中止。",
		},
	],
};

const queryInputSchema: ActionInputSchema = {
	description: '对象参数；operation 为 "help"、"list"、"get" 或 "history"。',
	operations: [
		{
			name: "help",
			description: "返回全部定时任务 Action 的输入说明和示例。",
			parameters: [{ name: "operation", type: '"help"', required: true, description: "固定为 help。" }],
		},
		{
			name: "list",
			description: "列出全部定时任务。",
			parameters: [{ name: "operation", type: '"list"', required: true, description: "固定为 list。" }],
		},
		{
			name: "get",
			description: "查询指定定时任务。",
			parameters: taskIdParameters("get"),
		},
		{
			name: "history",
			description: "查询指定定时任务的执行历史。",
			parameters: taskIdParameters("history"),
		},
	],
};

const queryExamples: ActionExample[] = [
	{ description: "查看操作帮助", input: { operation: "help" } },
	{ description: "列出定时任务", input: { operation: "list" } },
	{ description: "查询任务执行历史", input: { operation: "history", taskId: "..." } },
];

const taskInputSchema: ActionInputSchema = {
	description:
		'对象参数；operation 为 "create"、"update"、"delete"、"enable" 或 "disable"。需要用户确认时会按 operation 自动使用对应界面，无需传 approvalUi。',
	operations: [
		{
			name: "create",
			description: "创建定时任务；cron 使用本机时区。",
			parameters: [
				{ name: "operation", type: '"create"', required: true, description: "固定为 create。" },
				{ name: "data.name", type: "string", required: true, description: "非空任务名称。" },
				{ name: "data.prompt", type: "string", required: true, description: "非空任务提示词。" },
				{ name: "data.cron", type: "string", required: true, description: "有效的 Cron 表达式。" },
				{ name: "data.isOnce", type: "boolean", required: true, description: "成功执行后是否自动停用。" },
				{ name: "data.enabled", type: "boolean", required: false, description: "是否启用；默认 true。" },
				{ name: "data.cwd", type: "string", required: true, description: "已存在的项目绝对目录。" },
				{ name: "data.modelKey", type: "string", required: false, description: "模型键；省略时使用默认模型。" },
				{
					name: "data.executionMode",
					type: '"inherit" | "sandbox" | "full-access"',
					required: false,
					description: "执行权限模式。",
				},
				{
					name: "data.skill",
					type: '{ name: string, alias?: string, type: "skill" | "scene" }',
					required: false,
					description: "执行前注入的技能或场景。",
				},
			],
		},
		{
			name: "update",
			description:
				"局部更新定时任务；只传用户要求修改的字段，不要先查询并复制未修改字段。确认界面会加载当前完整配置，用户可在执行前继续编辑。data 至少包含一个字段，modelKey/skill 传 null 可清除。",
			parameters: [
				{ name: "operation", type: '"update"', required: true, description: "固定为 update。" },
				{ name: "taskId", type: "string", required: true, description: "从 query list/get 结果取得。" },
				{
					name: "data",
					type: "object",
					required: true,
					description: "可更新 create 中的任意任务字段；至少提供一项。",
				},
			],
		},
		...["delete", "enable", "disable"].map((operation) => ({
			name: operation,
			description: operation === "delete" ? "删除非运行中的定时任务及其执行记录。" : `${operation} 指定定时任务。`,
			parameters: approvalTaskIdParameters(operation),
		})),
	],
};

const taskExamples: ActionExample[] = [
	{
		description: "创建每日任务",
		input: {
			operation: "create",
			data: {
				name: "每日总结",
				prompt: "总结项目今天的进展",
				cron: "0 18 * * *",
				isOnce: false,
				cwd: "C:\\workspace\\project",
				executionMode: "inherit",
			},
		},
	},
	{
		description: "修改执行时间并清除技能",
		input: { operation: "update", taskId: "...", data: { cron: "30 18 * * *", skill: null } },
	},
	{ description: "停用任务", input: { operation: "disable", taskId: "..." } },
];

const executionInputSchema: ActionInputSchema = {
	description:
		'对象参数；operation 为 "run-now" 或 "abort"。需要用户确认时会按 operation 自动使用对应界面，无需传 approvalUi。',
	operations: [
		{
			name: "run-now",
			description: "立即执行一次任务；任务已运行时拒绝重复执行。",
			parameters: approvalTaskIdParameters("run-now"),
		},
		{
			name: "abort",
			description: "中止任务当前运行的 Agent；未运行时返回 noop。",
			parameters: approvalTaskIdParameters("abort"),
		},
	],
};

const executionExamples: ActionExample[] = [
	{ description: "立即执行任务", input: { operation: "run-now", taskId: "..." } },
	{ description: "中止任务", input: { operation: "abort", taskId: "..." } },
];

function taskIdParameters(operation: string) {
	return [
		{ name: "operation", type: `"${operation}"`, required: true, description: `固定为 ${operation}。` },
		{ name: "taskId", type: "string", required: true, description: "从 query list/get 结果取得。" },
	];
}

function approvalTaskIdParameters(operation: string) {
	return taskIdParameters(operation);
}

function toJsonValue(value: unknown): JsonValue {
	try {
		return JSON.parse(JSON.stringify(value)) as JsonValue;
	} catch (error) {
		log.error("toJsonValue: failed to serialize value", error);
		throw error;
	}
}

async function runService<T>(operation: () => Promise<T>): Promise<JsonValue> {
	try {
		return toJsonValue(await operation());
	} catch (error) {
		if (error instanceof SchedulerServiceError) {
			throw new ActionError(error.code, error.message, error.details as JsonValue | undefined);
		}
		log.error("scheduler runService: unexpected error", error);
		throw error;
	}
}

function toUpdateInput(input: SchedulerTaskInput & { operation: "update" }): UpdateScheduledTaskInput {
	const { modelKey, skill, ...fields } = input.data;
	const patch: UpdateScheduledTaskInput = fields;
	if ("modelKey" in input.data) {
		patch.modelKey = modelKey === null ? undefined : modelKey;
	}
	if ("skill" in input.data) {
		patch.skill = skill === null ? undefined : skill;
	}
	return patch;
}

export function createSchedulerActions(service: SchedulerService): ActionDefinition[] {
	const queryAction: ActionDefinition = {
		id: "scheduler.query",
		domain: "scheduler",
		title: "查询定时任务",
		summary: "查看定时任务操作帮助、任务列表、任务详情或执行历史。",
		availability: "gui-main",
		permission: "scheduler.read",
		inputSchema: queryInputSchema,
		examples: queryExamples,
		validateInput: validateSchedulerQueryInput,
		run: async (input) => {
			const request = input as unknown as SchedulerQueryInput;
			if (request.operation === "help") {
				return toJsonValue({
					guidance:
						"更新任务时只提交用户要求变更的字段。系统会自动选择与 operation 对应的确认界面；更新确认界面会展示当前完整配置并允许用户继续编辑。",
					actions: [
						{ id: "scheduler.query", inputSchema: queryInputSchema, examples: queryExamples },
						{ id: "scheduler.task", inputSchema: taskInputSchema, examples: taskExamples },
						{ id: "scheduler.execution", inputSchema: executionInputSchema, examples: executionExamples },
					],
				});
			}
			if (request.operation === "list") return await runService(() => service.listTasks());
			if (request.operation === "get") return await runService(() => service.getTask(request.taskId));
			return await runService(() => service.getHistory(request.taskId));
		},
	};

	const taskAction: ActionDefinition = {
		id: "scheduler.task",
		domain: "scheduler",
		title: "管理定时任务",
		summary: "创建、更新、删除、启用或停用定时任务。",
		availability: "gui-main",
		permission: "scheduler.task.write",
		approval: taskApproval,
		inputSchema: taskInputSchema,
		examples: taskExamples,
		validateInput: validateSchedulerTaskInput,
		requiresApproval: (_input, context) => context.source === "local-server",
		run: async (input) => {
			const request = input as unknown as SchedulerTaskInput;
			switch (request.operation) {
				case "create":
					return await runService(() => service.createTask(request.data as CreateScheduledTaskInput));
				case "update":
					return await runService(() => service.updateTask(request.taskId, toUpdateInput(request)));
				case "delete":
					return await runService(() => service.deleteTask(request.taskId));
				case "enable":
					return await runService(() => service.setEnabled(request.taskId, true));
				case "disable":
					return await runService(() => service.setEnabled(request.taskId, false));
			}
		},
	};

	const executionAction: ActionDefinition = {
		id: "scheduler.execution",
		domain: "scheduler",
		title: "控制定时任务执行",
		summary: "立即执行或中止定时任务。",
		availability: "gui-main",
		permission: "scheduler.execution.write",
		approval: executionApproval,
		inputSchema: executionInputSchema,
		examples: executionExamples,
		validateInput: validateSchedulerExecutionInput,
		requiresApproval: (_input, context) => context.source === "local-server",
		run: async (input) => {
			const request = input as unknown as SchedulerExecutionInput;
			return request.operation === "run-now"
				? await runService(() => service.runNow(request.taskId))
				: await runService(() => service.abort(request.taskId));
		},
	};

	return [queryAction, taskAction, executionAction];
}
