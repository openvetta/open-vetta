import { mkdir } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import { allowProjectRoot, type ProjectEntry, readDesktopConfig, writeDesktopConfig } from "../../ipc/fs.js";
import { resolveSessionDirForCwd } from "../../ipc/session.js";
import { getSharedRuntime } from "../../runtime.js";
import { createOperationApprovals, runActionService, throwAgentEntityNotFound, toJsonValue } from "../shared.js";
import { type ActionDefinition, ActionError, type ActionExample, type ActionInputSchema } from "../types.js";
import {
	type ProjectsManageInput,
	type ProjectsQueryInput,
	validateProjectsManageInput,
	validateProjectsQueryInput,
} from "./projects.schema.js";

const queryInputSchema: ActionInputSchema = {
	description:
		'对象参数；operation 为 "help"、"list"、"list-sessions" 或 "list-runtime-projects"。list 返回侧边栏 config 项目；list-runtime-projects 返回 runtime 已有 session 的 cwd。',
	operations: [
		{
			name: "help",
			description: "返回 projects 域说明。",
			parameters: [{ name: "operation", type: '"help"', required: true, description: "固定为 help。" }],
		},
		{
			name: "list",
			description: "列出侧边栏项目与已归档项目。",
			parameters: [{ name: "operation", type: '"list"', required: true, description: "固定为 list。" }],
		},
		{
			name: "list-sessions",
			description: "列出指定 cwd 下的会话。",
			parameters: [
				{ name: "operation", type: '"list-sessions"', required: true, description: "固定为 list-sessions。" },
				{ name: "cwd", type: "string", required: true, description: "项目绝对路径。" },
			],
		},
		{
			name: "list-runtime-projects",
			description: "列出 runtime 中存在 session 的项目 cwd。",
			parameters: [
				{
					name: "operation",
					type: '"list-runtime-projects"',
					required: true,
					description: "固定为 list-runtime-projects。",
				},
			],
		},
	],
};

const manageInputSchema: ActionInputSchema = {
	description:
		'对象参数；operation 为 "create"、"open"、"rename"、"archive"、"unarchive" 或 "remove"。create 默认在 workspacePath 下建目录；remove 只移出侧边栏，不删磁盘。',
	operations: [
		{
			name: "create",
			description: "在工作区创建项目目录并加入侧边栏。",
			parameters: [
				{ name: "operation", type: '"create"', required: true, description: "固定为 create。" },
				{ name: "name", type: "string", required: true, description: "项目名/目录名。" },
				{ name: "path", type: "string", required: false, description: "绝对路径；省略则 workspace/name。" },
			],
		},
		{
			name: "open",
			description: "将已有目录加入侧边栏项目。",
			parameters: [
				{ name: "operation", type: '"open"', required: true, description: "固定为 open。" },
				{ name: "path", type: "string", required: true, description: "已存在目录的绝对路径。" },
				{ name: "name", type: "string", required: false, description: "显示名；默认目录名。" },
			],
		},
		{
			name: "rename",
			description: "重命名侧边栏显示名（不改磁盘路径）。",
			parameters: [
				{ name: "operation", type: '"rename"', required: true, description: "固定为 rename。" },
				{ name: "path", type: "string", required: true, description: "项目 path。" },
				{ name: "name", type: "string", required: true, description: "新显示名。" },
			],
		},
		{
			name: "archive",
			description: "归档项目。",
			parameters: [
				{ name: "operation", type: '"archive"', required: true, description: "固定为 archive。" },
				{ name: "path", type: "string", required: true, description: "项目 path。" },
			],
		},
		{
			name: "unarchive",
			description: "取消归档。",
			parameters: [
				{ name: "operation", type: '"unarchive"', required: true, description: "固定为 unarchive。" },
				{ name: "path", type: "string", required: true, description: "项目 path。" },
			],
		},
		{
			name: "remove",
			description: "从侧边栏移除（不删磁盘）。",
			parameters: [
				{ name: "operation", type: '"remove"', required: true, description: "固定为 remove。" },
				{ name: "path", type: "string", required: true, description: "项目 path。" },
			],
		},
	],
};

const queryExamples: ActionExample[] = [
	{ description: "列出侧边栏项目", input: { operation: "list" } },
	{ description: "列出会话", input: { operation: "list-sessions", cwd: "C:\\\\workspace\\\\demo" } },
];

const manageExamples: ActionExample[] = [
	{ description: "创建项目", input: { operation: "create", name: "demo" } },
	{ description: "归档项目", input: { operation: "archive", path: "C:\\\\workspace\\\\demo" } },
];

function samePath(a: string, b: string): boolean {
	return resolve(a) === resolve(b);
}

function findEntry(entries: ProjectEntry[], path: string): ProjectEntry | undefined {
	return entries.find((entry) => samePath(entry.path, path));
}

export function createProjectsActions(): ActionDefinition[] {
	return [
		{
			id: "projects.query",
			domain: "projects",
			title: "查询项目与会话",
			summary: "列出侧边栏项目、runtime 项目或指定 cwd 的会话列表。",
			availability: "gui-main",
			permission: "projects.read",
			keywords: ["项目", "project", "会话", "session", "侧边栏", "归档", "workspace"],
			inputSchema: queryInputSchema,
			examples: queryExamples,
			validateInput: validateProjectsQueryInput,
			run: async (input) => {
				const request = input as unknown as ProjectsQueryInput;
				if (request.operation === "help") {
					return toJsonValue({
						guidance: "侧边栏项目与 runtime session 项目不是同一数据源；批量/定时任务另有专用 Action。",
						actions: [
							{ id: "projects.query", inputSchema: queryInputSchema, examples: queryExamples },
							{ id: "projects.manage", inputSchema: manageInputSchema, examples: manageExamples },
						],
					});
				}
				if (request.operation === "list") {
					const config = await readDesktopConfig();
					return toJsonValue({
						workspacePath: config.workspacePath,
						projects: config.projects,
						archivedProjects: config.archivedProjects,
					});
				}
				if (request.operation === "list-runtime-projects") {
					const runtime = getSharedRuntime();
					const projects = await runtime.listProjects();
					for (const project of projects) allowProjectRoot(project.cwd);
					return toJsonValue({ projects });
				}
				const runtime = getSharedRuntime();
				allowProjectRoot(request.cwd);
				const sessionDir = resolveSessionDirForCwd(request.cwd);
				const sessions = await runtime.listSessions(request.cwd, sessionDir);
				return toJsonValue({ cwd: request.cwd, sessions });
			},
		},
		{
			id: "projects.manage",
			domain: "projects",
			title: "管理侧边栏项目",
			summary: "创建、打开、重命名、归档或移出侧边栏项目。",
			availability: "gui-main",
			permission: "projects.write",
			keywords: ["项目", "创建项目", "归档", "打开项目", "workspace"],
			approval: createOperationApprovals("projects.create", [
				{ id: "projects.create", title: "创建项目确认", description: "展示并可编辑待创建项目。" },
				{ id: "projects.open", title: "打开项目确认", description: "展示并可编辑待打开项目路径。" },
				{ id: "projects.rename", title: "重命名项目确认", description: "展示并可编辑项目名称。" },
				{ id: "projects.archive", title: "归档项目确认", description: "展示待归档项目。" },
				{ id: "projects.unarchive", title: "取消归档项目确认", description: "展示待恢复项目。" },
				{ id: "projects.remove", title: "移除项目确认", description: "展示待移除项目。" },
			]),
			inputSchema: manageInputSchema,
			examples: manageExamples,
			validateInput: validateProjectsManageInput,
			assertReady: async (input) => {
				const request = input as unknown as ProjectsManageInput;
				// create 可新建；open 可导入路径；其余必须已在侧边栏（活跃或归档）中。
				if (request.operation === "create" || request.operation === "open") return;
				const config = await readDesktopConfig();
				const path = resolve(request.path);
				const active = findEntry(config.projects, path);
				const archived = findEntry(config.archivedProjects, path);
				const activePaths = config.projects.map((entry) => entry.path);
				const archivedPaths = config.archivedProjects.map((entry) => entry.path);
				if (request.operation === "archive" && !active) {
					throwAgentEntityNotFound({
						operation: request.operation,
						entity: "active sidebar project",
						idField: "path",
						id: path,
						queryAction: "projects.query",
						queryExample: { operation: "list" },
						resultIdPath: "projects[].path (active list)",
						availableIds: activePaths,
						extra: "archive only works on active projects. Archived paths cannot be archived again.",
					});
				}
				if (request.operation === "unarchive" && !archived) {
					throwAgentEntityNotFound({
						operation: request.operation,
						entity: "archived sidebar project",
						idField: "path",
						id: path,
						queryAction: "projects.query",
						queryExample: { operation: "list" },
						resultIdPath: "archivedProjects[].path",
						availableIds: archivedPaths,
						extra: "unarchive only works on archived projects.",
					});
				}
				if (!active && !archived) {
					throwAgentEntityNotFound({
						operation: request.operation,
						entity: "sidebar project",
						idField: "path",
						id: path,
						queryAction: "projects.query",
						queryExample: { operation: "list" },
						resultIdPath: "projects[].path or archivedProjects[].path",
						availableIds: [...activePaths, ...archivedPaths],
						extra: "Use absolute path exactly as returned by projects.query list.",
					});
				}
			},
			requiresApproval: (_input, context) => context.source === "local-server",
			run: async (input) => {
				const request = input as unknown as ProjectsManageInput;
				return await runActionService(async () => {
					const config = await readDesktopConfig();
					if (request.operation === "create") {
						const name = request.name.trim();
						if (name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
							throw new ActionError("ACTION_INVALID_INPUT", "Invalid project name.");
						}
						const path = request.path ? resolve(request.path) : resolve(join(config.workspacePath, name));
						if (!isAbsolute(path)) {
							throw new ActionError("ACTION_INVALID_INPUT", "Project path must be absolute.");
						}
						await mkdir(path, { recursive: true });
						allowProjectRoot(path);
						if (!findEntry(config.projects, path) && !findEntry(config.archivedProjects, path)) {
							config.projects.push({ path, name });
							await writeDesktopConfig(config);
						}
						return { operation: "create", path, name };
					}
					const path = resolve(request.path);
					if (request.operation === "open") {
						allowProjectRoot(path);
						if (!findEntry(config.projects, path)) {
							config.archivedProjects = config.archivedProjects.filter((entry) => !samePath(entry.path, path));
							config.projects.push({ path, name: request.name ?? basename(path) });
							await writeDesktopConfig(config);
						}
						return { operation: "open", path };
					}
					if (request.operation === "rename") {
						const entry = findEntry(config.projects, path) ?? findEntry(config.archivedProjects, path);
						if (!entry) throw new ActionError("ACTION_NOT_FOUND", `Project not found: ${path}`);
						entry.name = request.name;
						await writeDesktopConfig(config);
						return { operation: "rename", path, name: request.name };
					}
					if (request.operation === "archive") {
						const entry = findEntry(config.projects, path);
						if (!entry) throw new ActionError("ACTION_NOT_FOUND", `Active project not found: ${path}`);
						config.projects = config.projects.filter((item) => !samePath(item.path, path));
						if (!findEntry(config.archivedProjects, path)) config.archivedProjects.push(entry);
						await writeDesktopConfig(config);
						return { operation: "archive", path };
					}
					if (request.operation === "unarchive") {
						const entry = findEntry(config.archivedProjects, path);
						if (!entry) throw new ActionError("ACTION_NOT_FOUND", `Archived project not found: ${path}`);
						config.archivedProjects = config.archivedProjects.filter((item) => !samePath(item.path, path));
						if (!findEntry(config.projects, path)) config.projects.push(entry);
						await writeDesktopConfig(config);
						return { operation: "unarchive", path };
					}
					config.projects = config.projects.filter((item) => !samePath(item.path, path));
					config.archivedProjects = config.archivedProjects.filter((item) => !samePath(item.path, path));
					await writeDesktopConfig(config);
					return { operation: "remove", path };
				});
			},
		},
	];
}
