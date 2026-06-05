import { type BatchTaskService, BatchTaskServiceError } from "../../batch-tasks/batch-task-service.js";
import { type ActionDefinition, ActionError, type JsonValue } from "../types.js";
import {
	type BatchTasksExecutionInput,
	type BatchTasksProjectInput,
	type BatchTasksQueryInput,
	type BatchTasksTaskInput,
	validateBatchTasksExecutionInput,
	validateBatchTasksProjectInput,
	validateBatchTasksQueryInput,
	validateBatchTasksTaskInput,
} from "./batch-tasks.schema.js";

const projectApproval = {
	defaultPresentation: "batch-tasks.project",
	presentations: [
		{
			id: "batch-tasks.project",
			title: "批量项目操作确认",
			description: "展示批量项目创建、更新或删除操作详情，由用户确认是否执行。",
		},
		{
			id: "generic",
			title: "批量项目操作确认",
			description: "展示批量项目操作及完整输入，由用户确认是否执行。",
		},
	],
};

const taskApproval = {
	defaultPresentation: "batch-tasks.task",
	presentations: [
		{
			id: "batch-tasks.task",
			title: "批量任务操作确认",
			description: "展示批量任务执行、重试、停止、删除等操作详情，由用户确认是否执行。",
		},
		{
			id: "generic",
			title: "批量任务操作确认",
			description: "展示批量任务操作及完整输入，由用户确认是否执行。",
		},
	],
};

const executionApproval = {
	defaultPresentation: "batch-tasks.execution",
	presentations: [
		{
			id: "batch-tasks.execution",
			title: "批量执行控制确认",
			description: "展示批量执行开始、停止、重置等操作详情，由用户确认是否执行。",
		},
		{
			id: "generic",
			title: "批量执行控制确认",
			description: "展示批量执行控制操作及完整输入，由用户确认是否执行。",
		},
	],
};

function toJsonValue(value: unknown): JsonValue {
	return JSON.parse(JSON.stringify(value)) as JsonValue;
}

async function runService<T>(operation: () => Promise<T>): Promise<JsonValue> {
	try {
		return toJsonValue(await operation());
	} catch (error) {
		if (error instanceof BatchTaskServiceError) {
			throw new ActionError(error.code, error.message, error.details as JsonValue | undefined);
		}
		throw error;
	}
}

export function createBatchTasksActions(service: BatchTaskService): ActionDefinition[] {
	const queryAction: ActionDefinition = {
		id: "batch-tasks.query",
		domain: "batch-tasks",
		title: "查询批量任务",
		summary: "查看批量任务操作帮助、项目列表或指定项目及其子任务状态。",
		availability: "gui-main",
		permission: "batch-tasks.read",
		inputSchema: {
			description: '对象参数：{ "operation": "help" | "list" } 或 { "operation": "get", "projectId": string }。',
		},
		examples: [
			{ description: "查看批量任务 Action 帮助", input: { operation: "help" } },
			{ description: "列出全部批量项目", input: { operation: "list" } },
			{ description: "查看指定项目", input: { operation: "get", projectId: "项目绝对路径" } },
		],
		validateInput: validateBatchTasksQueryInput,
		run: async (input) => {
			const request = input as unknown as BatchTasksQueryInput;
			if (request.operation === "help") {
				return {
					actions: ["batch-tasks.query", "batch-tasks.project", "batch-tasks.task", "batch-tasks.execution"],
					note: "执行类操作只提交命令并立即返回；请使用 batch-tasks.query 继续查询状态。",
				};
			}
			if (request.operation === "list") {
				return await runService(() => service.listProjects());
			}
			return await runService(() => service.getProject(request.projectId));
		},
	};

	const projectAction: ActionDefinition = {
		id: "batch-tasks.project",
		domain: "batch-tasks",
		title: "管理批量项目",
		summary: "创建、更新或删除批量项目。",
		availability: "gui-main",
		permission: "batch-tasks.project.write",
		approval: projectApproval,
		inputSchema: {
			description:
				'对象参数，operation 为 "create"、"update" 或 "delete"。create 使用 data{name,prompt,folders,concurrency,...}；update 使用 projectId + data；delete 使用 projectId。可选 approvalUi 仅支持 "generic"。',
		},
		examples: [
			{
				description: "创建批量项目",
				input: {
					operation: "create",
					data: {
						name: "文档整理",
						prompt: "整理目录中的文档",
						folders: ["C:\\data\\a", "C:\\data\\b"],
						concurrency: 2,
					},
				},
			},
			{
				description: "修改项目并发数",
				input: { operation: "update", projectId: "项目绝对路径", data: { concurrency: 4 } },
			},
			{ description: "删除项目", input: { operation: "delete", projectId: "项目绝对路径" } },
		],
		validateInput: validateBatchTasksProjectInput,
		requiresApproval: (_input, context) => context.source === "local-server",
		run: async (input) => {
			const request = input as unknown as BatchTasksProjectInput;
			if (request.operation === "create") {
				return await runService(() => service.createProject(request.data));
			}
			if (request.operation === "update") {
				return await runService(() => service.updateProject(request.projectId, request.data));
			}
			return await runService(() => service.deleteProject(request.projectId));
		},
	};

	const taskAction: ActionDefinition = {
		id: "batch-tasks.task",
		domain: "batch-tasks",
		title: "操作批量子任务",
		summary: "执行、重试、停止、删除、继续子任务，或删除子任务会话。",
		availability: "gui-main",
		permission: "batch-tasks.task.write",
		approval: taskApproval,
		inputSchema: {
			description:
				'对象参数：{ "operation": "run" | "retry" | "stop" | "delete" | "resume" | "resume-with-text" | "delete-session", "projectId": string, "taskId": string, "text"?: string, "approvalUi"?: "generic" }。text 仅用于 resume-with-text。',
		},
		examples: [
			{
				description: "执行单个任务",
				input: { operation: "run", projectId: "项目绝对路径", taskId: "batch-task-..." },
			},
			{
				description: "带补充说明继续暂停任务",
				input: {
					operation: "resume-with-text",
					projectId: "项目绝对路径",
					taskId: "batch-task-...",
					text: "按原计划继续",
				},
			},
			{
				description: "删除任务会话",
				input: { operation: "delete-session", projectId: "项目绝对路径", taskId: "batch-task-..." },
			},
		],
		validateInput: validateBatchTasksTaskInput,
		requiresApproval: (_input, context) => context.source === "local-server",
		run: async (input) => {
			const request = input as unknown as BatchTasksTaskInput;
			switch (request.operation) {
				case "run":
					return await runService(() => service.runTask(request.projectId, request.taskId));
				case "retry":
					return await runService(() => service.retryTask(request.projectId, request.taskId));
				case "stop":
					return await runService(() => service.stopTask(request.projectId, request.taskId));
				case "delete":
					return await runService(() => service.deleteTask(request.projectId, request.taskId));
				case "resume":
					return await runService(() => service.resumeTask(request.projectId, request.taskId));
				case "resume-with-text":
					return await runService(() => service.resumeTask(request.projectId, request.taskId, request.text));
				case "delete-session":
					return await runService(() => service.deleteTaskSession(request.projectId, request.taskId));
			}
		},
	};

	const executionAction: ActionDefinition = {
		id: "batch-tasks.execution",
		domain: "batch-tasks",
		title: "控制批量项目执行",
		summary: "批量开始、停止、重置、重置失败任务或删除全部非运行任务。",
		availability: "gui-main",
		permission: "batch-tasks.execution.write",
		approval: executionApproval,
		inputSchema: {
			description:
				'对象参数：{ "operation": "delete-all" | "start" | "stop" | "reset" | "reset-failed", "projectId": string, "taskIds"?: string[], "approvalUi"?: "generic" }。taskIds 仅用于 reset-failed。',
		},
		examples: [
			{ description: "开始项目", input: { operation: "start", projectId: "项目绝对路径" } },
			{ description: "停止项目", input: { operation: "stop", projectId: "项目绝对路径" } },
			{
				description: "重置指定失败任务",
				input: {
					operation: "reset-failed",
					projectId: "项目绝对路径",
					taskIds: ["batch-task-..."],
				},
			},
		],
		validateInput: validateBatchTasksExecutionInput,
		requiresApproval: (_input, context) => context.source === "local-server",
		run: async (input) => {
			const request = input as unknown as BatchTasksExecutionInput;
			switch (request.operation) {
				case "delete-all":
					return await runService(() => service.deleteAllTasks(request.projectId));
				case "start":
					return await runService(() => service.startProject(request.projectId));
				case "stop":
					return await runService(() => service.stopProject(request.projectId));
				case "reset":
					return await runService(() => service.resetProject(request.projectId));
				case "reset-failed":
					return await runService(() => service.resetFailedTasks(request.projectId, request.taskIds));
			}
		},
	};

	return [queryAction, projectAction, taskAction, executionAction];
}
