import {
	findShortcutBindingConflict,
	getShortcutActionDef,
	listShortcutBindingsSnapshot,
	SHORTCUT_ACTIONS,
	type ShortcutActionId,
	type ShortcutBindings,
} from "../../../shared/shortcuts.js";
import {
	broadcastShortcutsBindingsChanged,
	type QuickPanelConfig,
	type QuickPanelTrigger,
	readDesktopConfig,
	writeDesktopConfig,
} from "../../ipc/fs.js";
import { syncQuickPanelTrigger } from "../../ipc/quickpanel.js";
import {
	createOperationApprovals,
	runActionService,
	throwAgentEntityNotFound,
	throwAgentInvalidInput,
	toJsonValue,
} from "../shared.js";
import type { ActionDefinition, ActionExample, ActionInputSchema } from "../types.js";
import {
	type ShortcutsManageInput,
	type ShortcutsQueryInput,
	validateShortcutsManageInput,
	validateShortcutsQueryInput,
} from "./shortcuts.schema.js";

type QuickPanelBehavior = NonNullable<QuickPanelConfig["postSendBehavior"]>;

interface QuickPanelSnapshot {
	trigger: QuickPanelTrigger;
	postSendBehavior: QuickPanelBehavior;
}

const queryInputSchema: ActionInputSchema = {
	description:
		'对象参数；operation 为 "help" 或 "get"。对应设置 → 快捷键整页：全局应用快捷键 + 快捷面板呼出/发送后行为。',
	operations: [
		{
			name: "help",
			description: "返回 shortcuts 域说明、可用绑定 id、快捷面板选项。",
			parameters: [{ name: "operation", type: '"help"', required: true, description: "固定为 help。" }],
		},
		{
			name: "get",
			description: "读取全局快捷键绑定与快捷面板相关快捷设置快照。",
			parameters: [{ name: "operation", type: '"get"', required: true, description: "固定为 get。" }],
		},
	],
};

const manageInputSchema: ActionInputSchema = {
	description:
		'对象参数；operation 为 "set-binding" | "reset-binding" | "reset-all-bindings" | "set-quick-panel-trigger" | "set-quick-panel-behavior"。对应设置 → 快捷键整页。',
	operations: [
		{
			name: "set-binding",
			description: "为指定应用动作设置自定义快捷键（格式如 mod+n、mod+shift+o）。",
			parameters: [
				{ name: "operation", type: '"set-binding"', required: true, description: "固定为 set-binding。" },
				{
					name: "id",
					type: "string",
					required: true,
					description: `动作 id：${SHORTCUT_ACTIONS.map((a) => a.id).join(" | ")}。先 query get 再复制。`,
				},
				{
					name: "shortcut",
					type: "string",
					required: true,
					description: '序列化组合键，如 "mod+n"。修饰键：mod（⌘/Ctrl）、ctrl、shift、alt。',
				},
			],
		},
		{
			name: "reset-binding",
			description: "将单个应用动作恢复为默认快捷键。",
			parameters: [
				{ name: "operation", type: '"reset-binding"', required: true, description: "固定为 reset-binding。" },
				{ name: "id", type: "string", required: true, description: "动作 id。" },
			],
		},
		{
			name: "reset-all-bindings",
			description: "将全部全局应用快捷键恢复默认（不影响快捷面板触发与发送后行为）。",
			parameters: [
				{
					name: "operation",
					type: '"reset-all-bindings"',
					required: true,
					description: "固定为 reset-all-bindings。",
				},
			],
		},
		{
			name: "set-quick-panel-trigger",
			description: "设置快捷面板双击功能键呼出：none | mod | alt | shift。",
			parameters: [
				{
					name: "operation",
					type: '"set-quick-panel-trigger"',
					required: true,
					description: "固定为 set-quick-panel-trigger。",
				},
				{
					name: "trigger",
					type: '"none" | "mod" | "alt" | "shift"',
					required: true,
					description: "none=关闭；mod=双击 ⌘/Ctrl；alt=双击 ⌥/Alt；shift=双击 ⇧。",
				},
			],
		},
		{
			name: "set-quick-panel-behavior",
			description: "设置快捷面板发送后行为：foreground | background。",
			parameters: [
				{
					name: "operation",
					type: '"set-quick-panel-behavior"',
					required: true,
					description: "固定为 set-quick-panel-behavior。",
				},
				{
					name: "behavior",
					type: '"foreground" | "background"',
					required: true,
					description: "foreground=打开主窗定位新会话；background=后台运行仅关面板。",
				},
			],
		},
	],
};

const queryExamples: ActionExample[] = [
	{ description: "查看快捷键域说明与可用 id", input: { operation: "help" } },
	{ description: "读取全局绑定 + 快捷面板设置", input: { operation: "get" } },
];

const manageExamples: ActionExample[] = [
	{
		description: "把新建会话改为 mod+shift+n",
		input: { operation: "set-binding", id: "new-session", shortcut: "mod+shift+n" },
	},
	{ description: "恢复打开项目默认键", input: { operation: "reset-binding", id: "open-project" } },
	{ description: "全部恢复默认全局绑定", input: { operation: "reset-all-bindings" } },
	{ description: "启用双击 mod 呼出快捷面板", input: { operation: "set-quick-panel-trigger", trigger: "mod" } },
	{ description: "快捷面板发送后后台运行", input: { operation: "set-quick-panel-behavior", behavior: "background" } },
	{ description: "关闭快捷面板呼出", input: { operation: "set-quick-panel-trigger", trigger: "none" } },
];

function readBindingsFromConfig(bindings: ShortcutBindings | undefined): ShortcutBindings {
	return { ...(bindings ?? {}) };
}

function bindingsAsRecord(bindings: ShortcutBindings): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(bindings)) {
		if (typeof value === "string") out[key] = value;
	}
	return out;
}

function snapshotQuickPanel(config: Awaited<ReturnType<typeof readDesktopConfig>>): QuickPanelSnapshot {
	const trigger: QuickPanelTrigger =
		config.quickPanel?.trigger === "mod" ||
		config.quickPanel?.trigger === "alt" ||
		config.quickPanel?.trigger === "shift"
			? config.quickPanel.trigger
			: "none";
	const postSendBehavior: QuickPanelBehavior =
		config.quickPanel?.postSendBehavior === "background" ? "background" : "foreground";
	return { trigger, postSendBehavior };
}

async function persistBindings(bindings: ShortcutBindings) {
	const config = await readDesktopConfig();
	config.shortcuts = { bindings };
	await writeDesktopConfig(config);
	broadcastShortcutsBindingsChanged(bindingsAsRecord(bindings));
	return listShortcutBindingsSnapshot(bindings);
}

export function createShortcutsActions(): ActionDefinition[] {
	return [
		{
			id: "shortcuts.query",
			domain: "shortcuts",
			title: "查询快捷键设置",
			summary: "读取设置 → 快捷键：全局应用快捷键绑定与快捷面板呼出/发送后行为。",
			availability: "gui-main",
			permission: "shortcuts.read",
			keywords: [
				"快捷键",
				"shortcut",
				"hotkey",
				"键盘",
				"绑定",
				"keybinding",
				"new-session",
				"open-project",
				"open-settings",
				"全局快捷键",
				"快捷面板",
				"quick panel",
				"双击",
				"double tap",
			],
			inputSchema: queryInputSchema,
			examples: queryExamples,
			validateInput: validateShortcutsQueryInput,
			run: async (input) => {
				const request = input as unknown as ShortcutsQueryInput;
				if (request.operation === "help") {
					return toJsonValue({
						guidance:
							"shortcuts 对应设置 → 快捷键整页。bindings：new-session / open-project / open-settings 的应用内组合键；quickPanel：双击功能键呼出与发送后行为。打开设置页 → navigation.open target=shortcuts（或 section shortcuts-global / shortcuts-quickpanel）。快捷面板窗口/会话能力不在此域。",
						availableActions: SHORTCUT_ACTIONS.map((action) => ({
							id: action.id,
							defaultShortcut: action.defaultShortcut,
						})),
						quickPanelOptions: {
							trigger: ["none", "mod", "alt", "shift"],
							postSendBehavior: ["foreground", "background"],
						},
						actions: [
							{ id: "shortcuts.query", inputSchema: queryInputSchema, examples: queryExamples },
							{ id: "shortcuts.manage", inputSchema: manageInputSchema, examples: manageExamples },
						],
					});
				}
				const config = await readDesktopConfig();
				const bindings = readBindingsFromConfig(config.shortcuts?.bindings);
				return toJsonValue({
					bindings: listShortcutBindingsSnapshot(bindings),
					quickPanel: snapshotQuickPanel(config),
				});
			},
		},
		{
			id: "shortcuts.manage",
			domain: "shortcuts",
			title: "修改快捷键设置",
			summary: "修改设置 → 快捷键：全局绑定或快捷面板呼出/发送后行为。",
			availability: "gui-main",
			permission: "shortcuts.write",
			keywords: [
				"快捷键",
				"shortcut",
				"重置快捷键",
				"改快捷键",
				"keybinding",
				"reset",
				"快捷面板",
				"quick panel",
				"双击",
			],
			approval: createOperationApprovals("shortcuts.set-binding", [
				{ id: "shortcuts.set-binding", title: "修改快捷键绑定确认", description: "展示并可编辑目标动作与组合键。" },
				{ id: "shortcuts.reset-binding", title: "恢复单项快捷键确认", description: "确认将单个动作恢复默认键。" },
				{
					id: "shortcuts.reset-all-bindings",
					title: "恢复全部全局快捷键确认",
					description: "确认将全部全局应用快捷键恢复默认。",
				},
				{
					id: "shortcuts.set-quick-panel-trigger",
					title: "修改快捷面板触发确认",
					description: "确认双击功能键呼出方式。",
				},
				{
					id: "shortcuts.set-quick-panel-behavior",
					title: "修改快捷面板发送后行为确认",
					description: "确认发送后前台/后台行为。",
				},
			]),
			inputSchema: manageInputSchema,
			examples: manageExamples,
			validateInput: validateShortcutsManageInput,
			assertReady: (input) => {
				const request = input as unknown as ShortcutsManageInput;
				if (request.operation === "set-binding" || request.operation === "reset-binding") {
					if (!isShortcutActionIdSafe(request.id)) {
						throwAgentEntityNotFound({
							operation: request.operation,
							entity: "shortcut action",
							idField: "id",
							id: request.id,
							queryAction: "shortcuts.query",
							queryExample: { operation: "help" },
							resultIdPath: "availableActions[].id",
							availableIds: SHORTCUT_ACTIONS.map((a) => a.id),
						});
					}
				}
			},
			requiresApproval: (_input, context) => context.source === "local-server",
			run: async (input) => {
				const request = input as unknown as ShortcutsManageInput;
				return await runActionService(async () => {
					if (request.operation === "set-binding") {
						const config = await readDesktopConfig();
						const current = readBindingsFromConfig(config.shortcuts?.bindings);
						const id = request.id as ShortcutActionId;
						const conflict = findShortcutBindingConflict(id, request.shortcut, current);
						if (conflict) {
							throwAgentInvalidInput(
								`Shortcut ${JSON.stringify(request.shortcut)} is already bound to ${JSON.stringify(conflict)}. Reset or rebind that action first.`,
								{
									reason: "shortcut_conflict",
									id,
									shortcut: request.shortcut,
									conflictsWith: conflict,
								},
							);
						}
						const next: ShortcutBindings = { ...current };
						const def = getShortcutActionDef(id);
						if (request.shortcut === def.defaultShortcut) {
							delete next[id];
						} else {
							next[id] = request.shortcut;
						}
						const bindings = await persistBindings(next);
						return { operation: "set-binding", id, shortcut: request.shortcut, bindings };
					}

					if (request.operation === "reset-binding") {
						const config = await readDesktopConfig();
						const current = readBindingsFromConfig(config.shortcuts?.bindings);
						const id = request.id as ShortcutActionId;
						const next: ShortcutBindings = { ...current };
						delete next[id];
						const bindings = await persistBindings(next);
						return {
							operation: "reset-binding",
							id,
							shortcut: getShortcutActionDef(id).defaultShortcut,
							bindings,
						};
					}

					if (request.operation === "reset-all-bindings") {
						const bindings = await persistBindings({});
						return { operation: "reset-all-bindings", bindings };
					}

					if (request.operation === "set-quick-panel-trigger") {
						const config = await readDesktopConfig();
						const current = snapshotQuickPanel(config);
						config.quickPanel = {
							...config.quickPanel,
							trigger: request.trigger,
							postSendBehavior: current.postSendBehavior,
						};
						await writeDesktopConfig(config);
						await syncQuickPanelTrigger();
						return { operation: "set-quick-panel-trigger", quickPanel: snapshotQuickPanel(config) };
					}

					// set-quick-panel-behavior
					const config = await readDesktopConfig();
					const current = snapshotQuickPanel(config);
					config.quickPanel = {
						...config.quickPanel,
						trigger: current.trigger,
						postSendBehavior: request.behavior,
					};
					await writeDesktopConfig(config);
					await syncQuickPanelTrigger();
					return { operation: "set-quick-panel-behavior", quickPanel: snapshotQuickPanel(config) };
				});
			},
		},
	];
}

function isShortcutActionIdSafe(value: string): value is ShortcutActionId {
	return SHORTCUT_ACTIONS.some((action) => action.id === value);
}
