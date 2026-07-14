import type { InstalledPlugin, PluginPermission } from "@preload/api";
import { i18n } from "@shared/i18n";
import type { MarketPluginInfo } from "@shared/lib/api";
import { downloadPlugin, fetchMarketPlugins } from "@shared/lib/api";
import { authTokenAtom, confirmDialogAtom } from "@shared/store/atoms";
import { useAtomValue, useSetAtom } from "jotai";
import type { ChangeEvent, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notifyPluginsChanged } from "../../plugins/runtime/plugin-events";

// 模块级常量不存中文：映射到 skills ns 的 i18n key，渲染期用 t() 解析。
export const PERMISSION_LABEL_KEYS = {
	"ui.slot.global": "plugin.permission.uiSlotGlobal",
	"ui.slot.file-preview": "plugin.permission.uiSlotFilePreview",
	"ui.slot.activity-tab": "plugin.permission.uiSlotActivityTab",
	"ui.slot.input-action": "plugin.permission.uiSlotInputAction",
	"ui.slot.message": "plugin.permission.uiSlotMessage",
	"ui.slot.tool-call": "plugin.permission.uiSlotToolCall",
	"ui.slot.turn-card": "plugin.permission.uiSlotTurnCard",
	"agent.session.read": "plugin.permission.agentSessionRead",
	"agent.session.write": "plugin.permission.agentSessionWrite",
	"agent.command.run": "plugin.permission.agentCommandRun",
	"agent.systemPrompt.read": "plugin.permission.agentSystemPromptRead",
	"agent.systemPrompt.write": "plugin.permission.agentSystemPromptWrite",
	"agent.systemPrompt.fullControl": "plugin.permission.agentSystemPromptFullControl",
	"agent.skills.control": "plugin.permission.agentSkillsControl",
	"agent.tools.control": "plugin.permission.agentToolsControl",
	"agent.tools.register": "plugin.permission.agentToolsRegister",
	"agent.toolHandler.execute": "plugin.permission.agentToolHandlerExecute",
	"agent.state.read": "plugin.permission.agentStateRead",
	"agent.state.write": "plugin.permission.agentStateWrite",
	"agent.continuation.register": "plugin.permission.agentContinuationRegister",
	"agent.runtime.configure": "plugin.permission.agentRuntimeConfigure",
	"fs.read": "plugin.permission.fsRead",
	"fs.write": "plugin.permission.fsWrite",
	"network.fetch": "plugin.permission.networkFetch",
	"images.generate": "plugin.permission.imagesGenerate",
	"settings.read": "plugin.permission.settingsRead",
	"settings.write": "plugin.permission.settingsWrite",
} as const satisfies Record<PluginPermission, string>;

// 同样返回 i18n key，渲染期用 t() 解析。
export function pluginSourceKey(source: InstalledPlugin["source"]) {
	if (source === "remote") return "plugin.source.remote";
	if (source === "system") return "plugin.source.system";
	return "plugin.source.local";
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

// 已装插件 + 市场插件 reconcile 成三态。
export interface PluginRow {
	id: string;
	name: string;
	description: string;
	author: string;
	/** 展示版本：已装取 activeVersion，未装取市场 version。 */
	version: string;
	installed: InstalledPlugin | null;
	market: MarketPluginInfo | null;
	/** 已装（非系统）且市场版本与本地不一致。 */
	needsUpdate: boolean;
	downloadCount?: number;
}

function mergePlugins(installed: InstalledPlugin[], market: MarketPluginInfo[]): PluginRow[] {
	const rows = new Map<string, PluginRow>();
	for (const p of installed) {
		rows.set(p.id, {
			id: p.id,
			name: p.name,
			description: p.description ?? "",
			author: p.author ?? "",
			version: p.activeVersion,
			installed: p,
			market: null,
			needsUpdate: false,
		});
	}
	for (const m of market) {
		const existing = rows.get(m.plugin_id);
		if (existing?.installed) {
			existing.market = m;
			existing.downloadCount = m.download_count;
			existing.needsUpdate =
				existing.installed.source !== "system" && m.version !== existing.installed.activeVersion;
			continue;
		}
		rows.set(m.plugin_id, {
			id: m.plugin_id,
			name: m.name,
			description: m.description,
			author: m.author,
			version: m.version,
			installed: null,
			market: m,
			needsUpdate: false,
			downloadCount: m.download_count,
		});
	}
	// 已装优先，其次未装；同态按名称稳定排序。
	return Array.from(rows.values()).sort((a, b) => {
		const rank = (r: PluginRow) => (r.installed ? 0 : 1);
		return rank(a) - rank(b) || a.name.localeCompare(b.name);
	});
}

export interface PluginsPanelHandle {
	triggerImport: () => void;
}

export interface PluginsPanelModel {
	fileInputRef: RefObject<HTMLInputElement | null>;
	token: string | null;
	busy: string | null;
	error: string | null;
	message: string | null;
	loading: boolean;
	systemExpanded: boolean;
	setSystemExpanded: (expanded: boolean | ((expanded: boolean) => boolean)) => void;
	selectedId: string | null;
	setSelectedId: (id: string | null) => void;
	mainRows: PluginRow[];
	systemRows: PluginRow[];
	selected: PluginRow | null;
	handleArchiveSelected: (event: ChangeEvent<HTMLInputElement>) => void;
	handleInstallFromMarket: (row: PluginRow) => void;
	handleToggleEnabled: (pluginId: string, enabled: boolean) => void;
	handleTogglePermission: (pluginId: string, permission: PluginPermission, granted: boolean) => void;
	handleToggleCommand: (pluginId: string, command: string, granted: boolean) => void;
	handleReload: (pluginId: string) => void;
	handleUninstall: (plugin: InstalledPlugin) => void;
}

export function usePluginsPanelModel(): PluginsPanelModel {
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const token = useAtomValue(authTokenAtom);
	const setConfirmDialog = useSetAtom(confirmDialogAtom);
	const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
	const [marketPlugins, setMarketPlugins] = useState<MarketPluginInfo[]>([]);
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [systemExpanded, setSystemExpanded] = useState(false);

	const refresh = useCallback(async () => {
		setPlugins(await window.vetta.plugins.list());
	}, []);

	const loadMarket = useCallback(async () => {
		if (!token) {
			setMarketPlugins([]);
			return;
		}
		try {
			setMarketPlugins(await fetchMarketPlugins(token));
		} catch {
			// 市场拉取失败不影响已装插件管理，仅静默降级为空市场。
			setMarketPlugins([]);
		}
	}, [token]);

	useEffect(() => {
		void Promise.all([refresh(), loadMarket()])
			.catch((err: unknown) => setError(getErrorMessage(err)))
			.finally(() => setLoading(false));
	}, [refresh, loadMarket]);

	const runOperation = useCallback(
		async (busyLabel: string, operation: () => Promise<string | null>, notifyHost = true) => {
			setBusy(busyLabel);
			setError(null);
			setMessage(null);
			try {
				const nextMessage = await operation();
				await refresh();
				if (notifyHost) notifyPluginsChanged();
				setMessage(nextMessage);
			} catch (err) {
				setError(getErrorMessage(err));
			} finally {
				setBusy(null);
			}
		},
		[refresh],
	);

	const handleArchiveSelected = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0];
			event.target.value = "";
			if (!file) return;
			void runOperation("install-archive", async () => {
				const plugin = await window.vetta.plugins.installFromArchive(await file.arrayBuffer());
				return i18n.t("skills:plugin.message.installed", { name: plugin.name, version: plugin.version });
			});
		},
		[runOperation],
	);

	const handleInstallFromMarket = useCallback(
		(row: PluginRow) => {
			if (busy !== null) return;
			void runOperation(`install:${row.id}`, async () => {
				if (!token) throw new Error(i18n.t("skills:error.notLoggedIn"));
				const buffer = await downloadPlugin(token, row.id);
				const plugin = await window.vetta.plugins.installFromArchive(buffer, { source: "remote" });
				return i18n.t("skills:plugin.message.installed", { name: plugin.name, version: plugin.version });
			});
		},
		[busy, token, runOperation],
	);

	const handleToggleEnabled = useCallback(
		(pluginId: string, enabled: boolean) => {
			void runOperation(`enable:${pluginId}`, async () => {
				await window.vetta.plugins.setEnabled(pluginId, enabled);
				return enabled ? i18n.t("skills:plugin.message.enabled") : i18n.t("skills:plugin.message.disabled");
			});
		},
		[runOperation],
	);

	const handleTogglePermission = useCallback(
		(pluginId: string, permission: PluginPermission, granted: boolean) => {
			void runOperation(`permission:${pluginId}:${permission}`, async () => {
				if (granted) {
					await window.vetta.plugins.grantPermissions(pluginId, [permission]);
					return i18n.t("skills:plugin.message.permissionGranted");
				}
				await window.vetta.plugins.revokePermissions(pluginId, [permission]);
				return i18n.t("skills:plugin.message.permissionRevoked");
			});
		},
		[runOperation],
	);

	const handleToggleCommand = useCallback(
		(pluginId: string, command: string, granted: boolean) => {
			void runOperation(`command:${pluginId}:${command}`, async () => {
				if (granted) {
					await window.vetta.plugins.grantCommands(pluginId, [command]);
					return i18n.t("skills:plugin.message.commandEnabled");
				}
				await window.vetta.plugins.revokeCommands(pluginId, [command]);
				return i18n.t("skills:plugin.message.commandDisabled");
			});
		},
		[runOperation],
	);

	const handleReload = useCallback(
		(pluginId: string) => {
			void runOperation(`reload:${pluginId}`, async () => {
				const plugin = await window.vetta.plugins.reload(pluginId);
				return i18n.t("skills:plugin.message.reloaded", { name: plugin.name, version: plugin.activeVersion });
			});
		},
		[runOperation],
	);

	const handleUninstall = useCallback(
		(plugin: InstalledPlugin) => {
			setConfirmDialog({
				title: i18n.t("skills:plugin.confirm.uninstallTitle"),
				message: i18n.t("skills:plugin.confirm.uninstallMessage", { name: plugin.name }),
				confirmLabel: i18n.t("skills:actions.uninstall"),
				variant: "danger",
				onConfirm: () => {
					setSelectedId(null);
					void runOperation(`uninstall:${plugin.id}`, async () => {
						await window.vetta.plugins.uninstall(plugin.id);
						return i18n.t("skills:plugin.message.uninstalled");
					});
				},
			});
		},
		[runOperation, setConfirmDialog],
	);

	const rows = useMemo(() => mergePlugins(plugins, marketPlugins), [plugins, marketPlugins]);
	// 系统插件单独沉底；其余（市场 + 已装用户插件）走主网格。
	const mainRows = useMemo(() => rows.filter((r) => r.installed?.source !== "system"), [rows]);
	const systemRows = useMemo(() => rows.filter((r) => r.installed?.source === "system"), [rows]);
	const selected = rows.find((r) => r.id === selectedId && r.installed) ?? null;

	return {
		fileInputRef,
		token,
		busy,
		error,
		message,
		loading,
		systemExpanded,
		setSystemExpanded,
		selectedId,
		setSelectedId,
		mainRows,
		systemRows,
		selected,
		handleArchiveSelected,
		handleInstallFromMarket,
		handleToggleEnabled,
		handleTogglePermission,
		handleToggleCommand,
		handleReload,
		handleUninstall,
	};
}
