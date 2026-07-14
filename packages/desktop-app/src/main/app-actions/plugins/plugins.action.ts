import type { PluginPermission } from "../../../preload/api-types/plugins.js";
import { getAppLogger } from "../../logger.js";
import {
	buildAgentPluginRuntimeConfig,
	grantPluginPermissions,
	installPluginFromPath,
	installPluginFromUrl,
	listPlugins,
	reloadPlugin,
	setPluginEnabled,
	summarizeAgentPluginRuntimeConfig,
	uninstallPlugin,
} from "../../plugins/plugin-store.js";
import { getSharedRuntime } from "../../runtime.js";
import { createOperationApprovals, runActionService, throwAgentEntityNotFound, toJsonValue } from "../shared.js";
import { type ActionDefinition, ActionError, type ActionExample, type ActionInputSchema } from "../types.js";
import {
	type PluginsManageInput,
	type PluginsQueryInput,
	validatePluginsManageInput,
	validatePluginsQueryInput,
} from "./plugins.schema.js";

const log = getAppLogger("action-plugins");

const queryInputSchema: ActionInputSchema = {
	description: '对象参数；operation 为 "help"、"list" 或 "get"。',
	operations: [
		{
			name: "help",
			description: "返回 plugins 域说明。",
			parameters: [{ name: "operation", type: '"help"', required: true, description: "固定为 help。" }],
		},
		{
			name: "list",
			description: "列出已安装插件。",
			parameters: [{ name: "operation", type: '"list"', required: true, description: "固定为 list。" }],
		},
		{
			name: "get",
			description: "查看指定插件。",
			parameters: [
				{ name: "operation", type: '"get"', required: true, description: "固定为 get。" },
				{ name: "id", type: "string", required: true, description: "插件 id。" },
			],
		},
	],
};

const manageInputSchema: ActionInputSchema = {
	description:
		'对象参数；operation 为 "set-enabled"、"install-from-url"、"install-from-path"、"uninstall" 或 "reload"。install-from-path 在确认时按声明一次授权。',
	operations: [
		{
			name: "set-enabled",
			description: "启用或停用插件。",
			parameters: [
				{ name: "operation", type: '"set-enabled"', required: true, description: "固定为 set-enabled。" },
				{ name: "id", type: "string", required: true, description: "插件 id。" },
				{ name: "enabled", type: "boolean", required: true, description: "是否启用。" },
			],
		},
		{
			name: "install-from-url",
			description: "从 http(s) URL 安装插件包。",
			parameters: [
				{ name: "operation", type: '"install-from-url"', required: true, description: "固定为 install-from-url。" },
				{ name: "url", type: "string", required: true, description: "插件包 URL。" },
			],
		},
		{
			name: "install-from-path",
			description: "从本机 zip 绝对路径安装插件，确认后按 plugin.json 声明一次授予权限并默认启用。",
			parameters: [
				{
					name: "operation",
					type: '"install-from-path"',
					required: true,
					description: "固定为 install-from-path。",
				},
				{ name: "path", type: "string", required: true, description: "插件 zip 的绝对路径。" },
				{
					name: "grantedPermissions",
					type: "string[]",
					required: false,
					description: "要授予的权限；省略则安装时授予清单声明的全部权限。",
				},
				{ name: "enable", type: "boolean", required: false, description: "安装后是否启用，默认 true。" },
			],
		},
		{
			name: "uninstall",
			description: "卸载用户插件（系统插件不可卸）。",
			parameters: [
				{ name: "operation", type: '"uninstall"', required: true, description: "固定为 uninstall。" },
				{ name: "id", type: "string", required: true, description: "插件 id。" },
			],
		},
		{
			name: "reload",
			description: "重新加载插件。",
			parameters: [
				{ name: "operation", type: '"reload"', required: true, description: "固定为 reload。" },
				{ name: "id", type: "string", required: true, description: "插件 id。" },
			],
		},
	],
};

const queryExamples: ActionExample[] = [{ description: "列出插件", input: { operation: "list" } }];

const manageExamples: ActionExample[] = [
	{ description: "停用插件", input: { operation: "set-enabled", id: "my-plugin", enabled: false } },
	{ description: "从 URL 安装", input: { operation: "install-from-url", url: "https://example.com/plugin.zip" } },
	{
		description: "从本地 zip 安装",
		input: { operation: "install-from-path", path: "/abs/path/to/my-plugin-0.1.0.zip" },
	},
];

function refreshAgentPlugins(): void {
	const config = buildAgentPluginRuntimeConfig();
	log.debug("refresh agent plugins", summarizeAgentPluginRuntimeConfig(config));
	getSharedRuntime().reconfigureAgentPlugins(config);
}

function summarizePlugin(plugin: ReturnType<typeof listPlugins>[number]) {
	return {
		id: plugin.id,
		name: plugin.name,
		version: plugin.version,
		enabled: plugin.enabled,
		source: plugin.source,
		permissions: plugin.permissions,
		description: plugin.description,
	};
}

export function createPluginsActions(): ActionDefinition[] {
	return [
		{
			id: "plugins.query",
			domain: "plugins",
			title: "查询插件",
			summary: "列出或查看已安装插件。",
			availability: "gui-main",
			permission: "plugins.read",
			keywords: ["插件", "plugin", "扩展"],
			inputSchema: queryInputSchema,
			examples: queryExamples,
			validateInput: validatePluginsQueryInput,
			run: async (input) => {
				const request = input as unknown as PluginsQueryInput;
				if (request.operation === "help") {
					return toJsonValue({
						guidance: "权限 grant/revoke 请在设置页完成；Action 支持启停、URL 安装、卸载、reload。",
						actions: [
							{ id: "plugins.query", inputSchema: queryInputSchema, examples: queryExamples },
							{ id: "plugins.manage", inputSchema: manageInputSchema, examples: manageExamples },
						],
					});
				}
				const plugins = listPlugins();
				if (request.operation === "list") {
					return toJsonValue({ plugins: plugins.map(summarizePlugin) });
				}
				const plugin = plugins.find((item) => item.id === request.id);
				if (!plugin) throw new ActionError("ACTION_NOT_FOUND", `Plugin not found: ${request.id}`);
				return toJsonValue(summarizePlugin(plugin));
			},
		},
		{
			id: "plugins.manage",
			domain: "plugins",
			title: "管理插件",
			summary: "启用/停用、从 URL 安装、卸载或重新加载插件。",
			availability: "gui-main",
			permission: "plugins.write",
			keywords: ["插件", "plugin", "安装", "卸载", "启用"],
			approval: createOperationApprovals("plugins.set-enabled", [
				{ id: "plugins.set-enabled", title: "启用/停用插件确认", description: "展示插件启用状态变更。" },
				{ id: "plugins.install-from-url", title: "从 URL 安装插件确认", description: "展示并可编辑安装地址。" },
				{
					id: "plugins.install-from-path",
					title: "从本地路径安装插件确认",
					description: "展示 zip 路径；确认后按声明一次授权并启用。",
				},
				{ id: "plugins.uninstall", title: "卸载插件确认", description: "展示待卸载插件。" },
				{ id: "plugins.reload", title: "重载插件确认", description: "展示待重载插件。" },
			]),
			inputSchema: manageInputSchema,
			examples: manageExamples,
			validateInput: validatePluginsManageInput,
			assertReady: (input) => {
				const request = input as unknown as PluginsManageInput;
				// install-from-url / install-from-path 为创建；其余操作必须插件已安装。
				if (request.operation === "install-from-url" || request.operation === "install-from-path") return;
				const plugins = listPlugins();
				const plugin = plugins.find((item) => item.id === request.id);
				if (!plugin) {
					throwAgentEntityNotFound({
						operation: request.operation,
						entity: "plugin",
						idField: "id",
						id: request.id,
						queryAction: "plugins.query",
						queryExample: { operation: "list" },
						resultIdPath: "plugins[].id",
						availableIds: plugins.map((item) => item.id),
						extra: "Use the plugin id field, not the display name.",
					});
				}
			},
			requiresApproval: (_input, context) => context.source === "local-server",
			run: async (input) => {
				const request = input as unknown as PluginsManageInput;
				return await runActionService(async () => {
					if (request.operation === "set-enabled") {
						const plugin = setPluginEnabled(request.id, request.enabled);
						refreshAgentPlugins();
						return { operation: "set-enabled", plugin: summarizePlugin(plugin) };
					}
					if (request.operation === "install-from-url") {
						const plugin = await installPluginFromUrl(request.url);
						refreshAgentPlugins();
						return { operation: "install-from-url", plugin: summarizePlugin(plugin) };
					}
					if (request.operation === "install-from-path") {
						const grantedPermissions = request.grantedPermissions as PluginPermission[] | undefined;
						let plugin = await installPluginFromPath(request.path, {
							grantedPermissions,
							enable: request.enable !== false,
							source: "archive",
						});
						// Approve install = grant all declared permissions when caller omitted the list.
						if ((!grantedPermissions || grantedPermissions.length === 0) && plugin.permissions.length > 0) {
							plugin = grantPluginPermissions(plugin.id, plugin.permissions);
						}
						const enabled = setPluginEnabled(plugin.id, request.enable !== false);
						refreshAgentPlugins();
						return { operation: "install-from-path", plugin: summarizePlugin(enabled) };
					}
					if (request.operation === "uninstall") {
						uninstallPlugin(request.id);
						refreshAgentPlugins();
						return { operation: "uninstall", id: request.id };
					}
					const plugin = reloadPlugin(request.id);
					refreshAgentPlugins();
					return { operation: "reload", plugin: summarizePlugin(plugin) };
				});
			},
		},
	];
}
