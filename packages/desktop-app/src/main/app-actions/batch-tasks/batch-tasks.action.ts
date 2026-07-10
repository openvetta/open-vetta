import { type BatchTaskService, BatchTaskServiceError } from "../../batch-tasks/batch-task-service.js";
import { getAppLogger } from "../../logger.js";
import {
	type ActionDefinition,
	ActionError,
	type ActionExample,
	type ActionInputSchema,
	type JsonValue,
} from "../types.js";

const log = getAppLogger("action-batch");

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

const queryInputSchema: ActionInputSchema = {
	description: '对象参数；operation 为 "help"、"list" 或 "get"。get 还需要 projectId。',
	operations: [
		{
			name: "help",
			description: "返回全部批量任务 Action 的完整输入说明、示例和执行注意事项。",
			parameters: [{ name: "operation", type: '"help"', required: true, description: "固定为 help。" }],
		},
		{
			name: "list",
			description: "列出全部批量项目及其子任务，可从结果取得后续操作需要的 projectId 和 taskId。",
			parameters: [{ name: "operation", type: '"list"', required: true, description: "固定为 list。" }],
		},
		{
			name: "get",
			description: "查询指定项目及其全部子任务的最新持久化状态。",
			parameters: [
				{ name: "operation", type: '"get"', required: true, description: "固定为 get。" },
				{
					name: "projectId",
					type: "string",
					required: true,
					description: "项目绝对路径；应从 list/create 的返回结果中取得，不要使用项目名称代替。",
				},
			],
		},
	],
};

const queryExamples: ActionExample[] = [
	{ description: "查看全部 Action 的参数帮助", input: { operation: "help" } },
	{ description: "列出全部批量项目并取得 projectId/taskId", input: { operation: "list" } },
	{ description: "查看指定项目", input: { operation: "get", projectId: "C:\\workspace\\文档整理" } },
];

const projectInputSchema: ActionInputSchema = {
	description:
		'对象参数；operation 为 "create"、"update" 或 "delete"。创建和更新默认使用可编辑确认界面；generic 仅用于查看原始参数并确认。所有字段、范围、默认值和清空语义见 operations。',
	operations: [
		{
			name: "create",
			description: "在当前工作区创建批量项目；folders 中每个源目录生成一个子任务。",
			parameters: [
				{ name: "operation", type: '"create"', required: true, description: "固定为 create。" },
				{
					name: "data.name",
					type: "string",
					required: true,
					description: "非空项目名称，同时作为工作区下的目录名；不能是 .、..，不能包含 / 或 \\。",
				},
				{
					name: "data.prompt",
					type: "string",
					required: true,
					description: "应用于每个子任务的完整提示词，可为空字符串。",
				},
				{
					name: "data.folders",
					type: "string[]",
					required: true,
					description: "至少一个已存在的源目录路径；每个目录创建一个子任务。",
				},
				{
					name: "data.concurrency",
					type: "integer",
					required: true,
					description: "项目最大并发子任务数，范围 1..64。",
				},
				{
					name: "data.modelKey",
					type: "string",
					required: false,
					description: "模型键，通常为 provider/modelId；省略时执行阶段使用应用默认模型。",
				},
				{
					name: "data.executionMode",
					type: '"inherit" | "sandbox" | "full-access"',
					required: false,
					description:
						"执行权限模式：inherit 跟随应用全局默认，sandbox 使用沙盒，full-access 完全访问；创建时省略默认为 full-access。",
				},
				{
					name: "data.artifactPatterns",
					type: "string[]",
					required: false,
					description:
						"产物校验模式；子任务目录顶层必须全部匹配才算成功，* 匹配任意字符、? 匹配单个字符；省略或 [] 表示不校验。",
				},
				{
					name: "data.notifyEnabled",
					type: "boolean",
					required: false,
					description: "是否在子任务结束及项目全部结束时向已配置 Webhook 推送消息；默认 false。",
				},
				{
					name: "data.timeoutMinutes",
					type: "integer",
					required: false,
					description: "每个子任务单次运行的硬超时分钟数，范围 1..10080；默认 60。",
				},
				{
					name: "data.skill",
					type: '{ name: string, alias?: string, type: "skill" | "scene" }',
					required: false,
					description: "执行前注入的技能或场景；name 为注册名称，alias 仅用于展示，type 区分 skill/scene。",
				},
				{
					name: "approvalUi",
					type: '"batch-tasks.project" | "generic"',
					required: false,
					description: "审批界面；省略时使用 batch-tasks.project。",
				},
			],
		},
		{
			name: "update",
			description:
				"局部更新项目；只传用户要求修改的字段。默认确认界面会加载当前完整配置，用户可在执行前继续编辑。data 至少包含一个字段；只会新增 newFolders，不会删除已有子任务，删除子任务请调用 batch-tasks.task。",
			parameters: [
				{ name: "operation", type: '"update"', required: true, description: "固定为 update。" },
				{
					name: "projectId",
					type: "string",
					required: true,
					description: "项目绝对路径；从 query list/get 或 create 结果取得。",
				},
				{
					name: "data.name",
					type: "string",
					required: false,
					description: "当前存储层不支持重命名项目目录；不要用该字段执行项目改名。",
				},
				{ name: "data.prompt", type: "string", required: false, description: "替换项目提示词，可为空字符串。" },
				{
					name: "data.modelKey",
					type: "string",
					required: false,
					description: "替换模型键，必须为非空字符串；当前不支持通过 null 清除。",
				},
				{
					name: "data.concurrency",
					type: "integer",
					required: false,
					description: "替换最大并发数，范围 1..64。",
				},
				{
					name: "data.executionMode",
					type: '"inherit" | "sandbox" | "full-access"',
					required: false,
					description: "替换执行权限模式；inherit 表示跟随应用全局默认。",
				},
				{
					name: "data.artifactPatterns",
					type: "string[]",
					required: false,
					description: "替换产物校验模式；传 [] 可清除现有产物校验。",
				},
				{
					name: "data.notifyEnabled",
					type: "boolean",
					required: false,
					description: "启用或关闭 Webhook 消息推送。",
				},
				{
					name: "data.timeoutMinutes",
					type: "integer",
					required: false,
					description: "替换单任务硬超时，范围 1..10080；传 60 恢复默认值。",
				},
				{
					name: "data.newFolders",
					type: "string[]",
					required: false,
					description: "追加已存在的源目录；已存在的 sourcePath 会跳过，[] 不产生变化，不会移除旧目录。",
				},
				{
					name: "data.skill",
					type: '{ name: string, alias?: string, type: "skill" | "scene" } | null',
					required: false,
					description: "替换技能/场景；传 null 清除现有技能/场景。",
				},
				{
					name: "approvalUi",
					type: '"batch-tasks.project" | "generic"',
					required: false,
					description:
						"省略或传 batch-tasks.project 时，用户可编辑项目配置；仅需展示原始参数供确认时才使用 generic。",
				},
			],
		},
		{
			name: "delete",
			description: "删除项目目录及全部任务数据；项目存在运行中或排队任务时拒绝。",
			parameters: [
				{ name: "operation", type: '"delete"', required: true, description: "固定为 delete。" },
				{ name: "projectId", type: "string", required: true, description: "要删除的项目绝对路径。" },
				{
					name: "approvalUi",
					type: '"batch-tasks.project" | "generic"',
					required: false,
					description: "审批界面；省略时使用 batch-tasks.project。",
				},
			],
		},
	],
};

const projectExamples: ActionExample[] = [
	{
		description: "使用全部可选参数创建批量项目",
		input: {
			operation: "create",
			data: {
				name: "文档整理",
				prompt: "整理目录中的文档并生成 summary.md",
				folders: ["C:\\data\\a", "C:\\data\\b"],
				concurrency: 2,
				modelKey: "openai/gpt-5",
				executionMode: "inherit",
				artifactPatterns: ["summary.md"],
				notifyEnabled: true,
				timeoutMinutes: 90,
				skill: { name: "document-workflow", alias: "文档工作流", type: "skill" },
			},
		},
	},
	{
		description: "更新并发数、追加目录、清除产物校验和技能",
		input: {
			operation: "update",
			projectId: "C:\\workspace\\文档整理",
			data: {
				concurrency: 4,
				newFolders: ["C:\\data\\c"],
				artifactPatterns: [],
				notifyEnabled: false,
				skill: null,
			},
		},
	},
	{ description: "删除项目", input: { operation: "delete", projectId: "C:\\workspace\\文档整理" } },
];

const taskInputSchema: ActionInputSchema = {
	description:
		'对象参数；operation 为 "run"、"retry"、"stop"、"delete"、"resume"、"resume-with-text" 或 "delete-session"。',
	operations: [
		{
			name: "run",
			description: "执行一个从未执行且处于 pending 的子任务；已存在 session、运行中或排队中的任务不可执行。",
			parameters: taskParameters("run"),
		},
		{
			name: "retry",
			description: "删除旧会话、状态和任务目录内容后，从头重新执行非运行且非排队任务。",
			parameters: taskParameters("retry"),
		},
		{
			name: "stop",
			description: "中止运行中或排队中的任务，并删除会话、状态和任务目录内容，将任务重置为 pending。",
			parameters: taskParameters("stop"),
		},
		{
			name: "delete",
			description: "删除非运行任务及其项目子目录和状态；运行中的任务必须先 stop。",
			parameters: taskParameters("delete"),
		},
		{
			name: "resume",
			description: "继续 paused 任务，默认向会话发送“继续”；仅 paused 状态可用。",
			parameters: taskParameters("resume"),
		},
		{
			name: "resume-with-text",
			description: "使用调用方提供的补充文本继续 paused 任务；仅 paused 状态可用。",
			parameters: [
				...taskParameters("resume-with-text"),
				{
					name: "text",
					type: "string",
					required: true,
					description: "发送给原会话的补充指令；纯空白会退回“继续”。",
				},
			],
		},
		{
			name: "delete-session",
			description: "删除非运行且非排队任务关联的会话；任务没有 sessionPath 时返回 noop。",
			parameters: taskParameters("delete-session"),
		},
	],
};

const taskExamples: ActionExample[] = [
	{
		description: "执行单个任务",
		input: { operation: "run", projectId: "C:\\workspace\\文档整理", taskId: "batch-task-..." },
	},
	{
		description: "从头重试任务",
		input: { operation: "retry", projectId: "C:\\workspace\\文档整理", taskId: "batch-task-..." },
	},
	{
		description: "带补充说明继续暂停任务",
		input: {
			operation: "resume-with-text",
			projectId: "C:\\workspace\\文档整理",
			taskId: "batch-task-...",
			text: "保留已有结果，只补充缺失的摘要",
		},
	},
	{
		description: "删除任务会话",
		input: { operation: "delete-session", projectId: "C:\\workspace\\文档整理", taskId: "batch-task-..." },
	},
];

const executionInputSchema: ActionInputSchema = {
	description:
		'对象参数；operation 为 "delete-all"、"start"、"stop"、"reset" 或 "reset-failed"。注意 reset 会清空并立即重跑整个项目。',
	operations: [
		{
			name: "delete-all",
			description: "删除项目内所有非运行任务；运行中的任务保留，排队任务会从队列移除后删除。",
			parameters: executionParameters("delete-all"),
		},
		{
			name: "start",
			description: "将项目中所有未执行 pending 任务入队，并继续 paused 任务；已完成或失败任务不会自动重跑。",
			parameters: executionParameters("start"),
		},
		{
			name: "stop",
			description: "停止并清理所有未完成任务，包括排队、运行、失败和 paused 任务；completed 任务保留。",
			parameters: executionParameters("stop"),
		},
		{
			name: "reset",
			description: "中止全部活动任务，删除全部任务会话、状态和产物目录，然后立即将整个项目重新入队执行。",
			parameters: executionParameters("reset"),
		},
		{
			name: "reset-failed",
			description:
				"只清理 taskIds 中当前状态为 failed 的任务；若项目队列仍活跃则立即重新入队，否则仅重置为 pending。",
			parameters: [
				...executionParameters("reset-failed"),
				{
					name: "taskIds",
					type: "string[]",
					required: true,
					description: "至少一个 taskId；非 failed、未知或不属于该项目的 id 不会被处理。",
				},
			],
		},
	],
};

const executionExamples: ActionExample[] = [
	{ description: "开始项目", input: { operation: "start", projectId: "C:\\workspace\\文档整理" } },
	{ description: "停止项目内所有未完成任务", input: { operation: "stop", projectId: "C:\\workspace\\文档整理" } },
	{
		description: "清空全部任务状态和产物并立即重跑",
		input: { operation: "reset", projectId: "C:\\workspace\\文档整理" },
	},
	{
		description: "重置指定失败任务",
		input: {
			operation: "reset-failed",
			projectId: "C:\\workspace\\文档整理",
			taskIds: ["batch-task-..."],
		},
	},
];

function taskParameters(operation: string) {
	return [
		{ name: "operation", type: `"${operation}"`, required: true, description: `固定为 ${operation}。` },
		{
			name: "projectId",
			type: "string",
			required: true,
			description: "项目绝对路径；从 query list/get 或 create 结果取得。",
		},
		{
			name: "taskId",
			type: "string",
			required: true,
			description: "项目内的子任务 id；从 query list/get 结果的 tasks[].id 取得。",
		},
		{
			name: "approvalUi",
			type: '"batch-tasks.task" | "generic"',
			required: false,
			description: "审批界面；省略时使用 batch-tasks.task。",
		},
	];
}

function executionParameters(operation: string) {
	return [
		{ name: "operation", type: `"${operation}"`, required: true, description: `固定为 ${operation}。` },
		{
			name: "projectId",
			type: "string",
			required: true,
			description: "项目绝对路径；从 query list/get 或 create 结果取得。",
		},
		{
			name: "approvalUi",
			type: '"batch-tasks.execution" | "generic"',
			required: false,
			description: "审批界面；省略时使用 batch-tasks.execution。",
		},
	];
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
		if (error instanceof BatchTaskServiceError) {
			throw new ActionError(error.code, error.message, error.details as JsonValue | undefined);
		}
		log.error("batch-tasks runService: unexpected error", error);
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
		keywords: ["批量", "批量任务", "批处理", "batch", "list", "查询", "列表", "help", "状态", "projectId"],
		inputSchema: queryInputSchema,
		examples: queryExamples,
		validateInput: validateBatchTasksQueryInput,
		run: async (input) => {
			const request = input as unknown as BatchTasksQueryInput;
			if (request.operation === "help") {
				return toJsonValue({
					guidance:
						"更新批量项目时只提交用户要求变更的字段。默认确认界面会合并当前配置并允许用户继续编辑；不要为了补全输入而复制未修改字段。",
					actions: [
						{ id: "batch-tasks.query", inputSchema: queryInputSchema, examples: queryExamples },
						{ id: "batch-tasks.project", inputSchema: projectInputSchema, examples: projectExamples },
						{ id: "batch-tasks.task", inputSchema: taskInputSchema, examples: taskExamples },
						{ id: "batch-tasks.execution", inputSchema: executionInputSchema, examples: executionExamples },
					],
					note: "执行类操作只提交命令并立即返回；请使用 batch-tasks.query 继续查询状态。",
				});
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
		keywords: [
			"批量",
			"批量任务",
			"批处理",
			"batch",
			"项目",
			"create",
			"update",
			"delete",
			"创建",
			"更新",
			"删除",
			"folders",
			"prompt",
			"并发",
		],
		approval: projectApproval,
		inputSchema: projectInputSchema,
		examples: projectExamples,
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
		keywords: [
			"批量",
			"批量任务",
			"子任务",
			"batch",
			"run",
			"retry",
			"stop",
			"resume",
			"执行",
			"重试",
			"停止",
			"继续",
			"删除会话",
			"taskId",
		],
		approval: taskApproval,
		inputSchema: taskInputSchema,
		examples: taskExamples,
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
		keywords: [
			"批量",
			"批量任务",
			"batch",
			"start",
			"stop",
			"reset",
			"开始",
			"停止",
			"重置",
			"全部执行",
			"清空",
			"执行控制",
		],
		approval: executionApproval,
		inputSchema: executionInputSchema,
		examples: executionExamples,
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
