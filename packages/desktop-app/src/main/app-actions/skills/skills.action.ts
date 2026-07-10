import { listSkills, readSkillsManifest, setSkillEnabled, uninstallSkill } from "../../ipc/skills.js";
import { genericApproval, runActionService, toJsonValue } from "../shared.js";
import type { ActionDefinition, ActionExample, ActionInputSchema } from "../types.js";
import {
	type SkillsManageInput,
	type SkillsQueryInput,
	validateSkillsManageInput,
	validateSkillsQueryInput,
} from "./skills.schema.js";

const queryInputSchema: ActionInputSchema = {
	description:
		'对象参数；operation 为 "help"、"list" 或 "manifest"。list 可传 cwd 以包含项目级 skills。市场安装需 GUI 下载归档，本 Action 不提供 install。',
	operations: [
		{
			name: "help",
			description: "返回 skills 域说明。",
			parameters: [{ name: "operation", type: '"help"', required: true, description: "固定为 help。" }],
		},
		{
			name: "list",
			description: "列出当前可见 skills/scenes。",
			parameters: [
				{ name: "operation", type: '"list"', required: true, description: "固定为 list。" },
				{ name: "cwd", type: "string", required: false, description: "项目绝对路径，用于发现项目级 skills。" },
			],
		},
		{
			name: "manifest",
			description: "读取本地安装清单（含 enabled/version）。",
			parameters: [{ name: "operation", type: '"manifest"', required: true, description: "固定为 manifest。" }],
		},
	],
};

const manageInputSchema: ActionInputSchema = {
	description: '对象参数；operation 为 "set-enabled" 或 "uninstall"。仅对 manifest 中已安装条目有效。',
	operations: [
		{
			name: "set-enabled",
			description: "启用或停用已安装 skill/scene。",
			parameters: [
				{ name: "operation", type: '"set-enabled"', required: true, description: "固定为 set-enabled。" },
				{ name: "name", type: "string", required: true, description: "skill/scene 名称。" },
				{ name: "enabled", type: "boolean", required: true, description: "true 启用，false 停用。" },
			],
		},
		{
			name: "uninstall",
			description: "卸载已安装 skill/scene。",
			parameters: [
				{ name: "operation", type: '"uninstall"', required: true, description: "固定为 uninstall。" },
				{ name: "name", type: "string", required: true, description: "skill/scene 名称。" },
				{ name: "type", type: '"skill" | "scene"', required: false, description: "省略时从 manifest 推断。" },
			],
		},
	],
};

const queryExamples: ActionExample[] = [
	{ description: "列出技能", input: { operation: "list" } },
	{ description: "查看安装清单", input: { operation: "manifest" } },
];

const manageExamples: ActionExample[] = [
	{ description: "停用技能", input: { operation: "set-enabled", name: "my-skill", enabled: false } },
	{ description: "卸载技能", input: { operation: "uninstall", name: "my-skill" } },
];

export function createSkillsActions(): ActionDefinition[] {
	return [
		{
			id: "skills.query",
			domain: "skills",
			title: "查询技能",
			summary: "列出可见技能/场景，或读取本地安装清单。",
			availability: "gui-main",
			permission: "skills.read",
			keywords: ["技能", "skill", "scene", "技能广场", "插件技能", "manifest"],
			inputSchema: queryInputSchema,
			examples: queryExamples,
			validateInput: validateSkillsQueryInput,
			run: async (input) => {
				const request = input as unknown as SkillsQueryInput;
				if (request.operation === "help") {
					return toJsonValue({
						guidance: "从市场安装请引导用户打开技能广场或使用 GUI；Action 支持 list/manifest 与启用停用/卸载。",
						actions: [
							{ id: "skills.query", inputSchema: queryInputSchema, examples: queryExamples },
							{ id: "skills.manage", inputSchema: manageInputSchema, examples: manageExamples },
						],
					});
				}
				if (request.operation === "manifest") {
					return await runActionService(() => readSkillsManifest());
				}
				return await runActionService(() => listSkills(request.cwd));
			},
		},
		{
			id: "skills.manage",
			domain: "skills",
			title: "管理技能",
			summary: "启用、停用或卸载已安装的技能/场景。",
			availability: "gui-main",
			permission: "skills.write",
			keywords: ["技能", "skill", "启用", "停用", "卸载", "uninstall"],
			approval: genericApproval,
			inputSchema: manageInputSchema,
			examples: manageExamples,
			validateInput: validateSkillsManageInput,
			requiresApproval: (_input, context) => context.source === "local-server",
			run: async (input) => {
				const request = input as unknown as SkillsManageInput;
				return await runActionService(async () => {
					if (request.operation === "set-enabled") {
						return { operation: "set-enabled", ...setSkillEnabled(request.name, request.enabled) };
					}
					await uninstallSkill(request.name, request.type);
					return { operation: "uninstall", name: request.name, type: request.type ?? null };
				});
			},
		},
	];
}
