import { useAtomValue, useSetAtom } from "jotai";
import { motion } from "motion/react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { InstalledPlugin, PluginPermission } from "@preload/api";
import type { MarketPluginInfo } from "@shared/lib/api";
import { downloadPlugin, fetchMarketPlugins } from "@shared/lib/api";
import { authTokenAtom, confirmDialogAtom } from "@shared/store/atoms";
import { Switch } from "@shared/components/ui/switch";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@shared/components/ui/drawer";
import { useTranslation } from "react-i18next";
import { notifyPluginsChanged } from "../../plugins/runtime/plugin-events";
import { usePluginI18n } from "../../plugins/runtime/plugin-i18n";

const easeOut = [0.22, 1, 0.36, 1] as const;

// 模块级常量不存中文：映射到 skills ns 的 i18n key，渲染期用 t() 解析。
const PERMISSION_LABEL_KEYS = {
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
function pluginSourceKey(source: InstalledPlugin["source"]) {
	if (source === "remote") return "plugin.source.remote";
	if (source === "system") return "plugin.source.system";
	return "plugin.source.local";
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

// ─── Merged row：已装插件 + 市场插件 reconcile 成三态 ───
interface PluginRow {
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

// ─── Plugin Card ───
function PluginCard({
	row,
	installing,
	onSelect,
	onInstall,
}: {
	row: PluginRow;
	installing: boolean;
	onSelect: (row: PluginRow) => void;
	onInstall: (row: PluginRow) => void;
}): JSX.Element {
	const isInstalled = row.installed !== null;
	const isSystem = row.installed?.source === "system";
	const enabled = row.installed?.enabled ?? false;
	const tr = usePluginI18n();
	const { t } = useTranslation("skills");
	const name = tr(row.installed ?? undefined, row.name);
	const description = tr(row.installed ?? undefined, row.description);

	return (
		<motion.div
			variants={{
				hidden: { opacity: 0, y: 10, scale: 0.98 },
				show: { opacity: 1, y: 0, scale: 1 },
			}}
			transition={{ type: "spring", stiffness: 280, damping: 26 }}
			whileHover={{ y: -2 }}
			onClick={() => (isInstalled ? onSelect(row) : onInstall(row))}
			className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl bg-muted transition-colors duration-200 hover:bg-accent"
		>
			<div className="flex flex-1 flex-col gap-2 px-3.5 pt-3 pb-3">
				<div className="flex items-start gap-2.5">
					<div
						className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
							isInstalled && enabled
								? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
								: "bg-accent/50 text-muted-foreground/70"
						}`}
					>
						<span className="icon-[mdi--puzzle-outline] h-4 w-4" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-baseline gap-2">
							<h4 className="truncate text-[13px] font-semibold tracking-tight text-foreground">
								{name}
							</h4>
							<span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/45">
								v{row.version}
							</span>
						</div>
						<p className="mt-0.5 line-clamp-2 text-[12px] leading-[1.5] text-muted-foreground/65">
							{description || t("card.noDescription")}
						</p>
					</div>
				</div>

				<div className="mt-auto flex items-center gap-2 pt-2">
					<div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
						{isInstalled ? (
							<span
								className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-semibold ${
									enabled
										? "bg-emerald-500/15 text-emerald-400"
										: "bg-accent/60 text-muted-foreground"
								}`}
							>
								<span
									className={`h-1.5 w-1.5 rounded-full ${
										enabled ? "bg-emerald-400" : "bg-muted-foreground/60"
									}`}
								/>
								{enabled ? t("plugin.status.enabled") : t("plugin.status.disabled")}
							</span>
						) : (
							<span className="inline-flex h-5 shrink-0 items-center rounded-full bg-accent/60 px-2 text-[10px] font-semibold text-muted-foreground">
								{t("plugin.status.notInstalled")}
							</span>
						)}
						{isSystem && (
							<span className="inline-flex h-5 shrink-0 items-center rounded-full bg-primary/10 px-2 text-[10px] font-semibold text-primary">
								{t("plugin.badge.system")}
							</span>
						)}
						{row.needsUpdate && (
							<span className="inline-flex h-5 shrink-0 items-center rounded-full bg-amber-500/15 px-2 text-[10px] font-semibold text-amber-500">
								{t("plugin.badge.updatable", { version: row.market?.version })}
							</span>
						)}
						{!isInstalled && row.downloadCount !== undefined && (
							<span className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full bg-accent/50 px-2 text-[10px] font-medium tabular-nums text-muted-foreground/70">
								<span className="icon-[mdi--download] h-3 w-3" />
								{row.downloadCount}
							</span>
						)}
						{row.author && (
							<span className="truncate text-[11px] text-muted-foreground/55">{row.author}</span>
						)}
					</div>
					{isInstalled ? (
						<span className="icon-[mdi--chevron-right] h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
					) : (
						<button
							type="button"
							disabled={installing}
							onClick={(e) => {
								e.stopPropagation();
								onInstall(row);
							}}
							className="flex shrink-0 items-center gap-1 rounded-lg border border-input bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
						>
							{installing ? (
								<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
							) : (
								<span className="icon-[mdi--download] h-3.5 w-3.5" />
							)}
							{t("actions.install")}
						</button>
					)}
				</div>
			</div>
		</motion.div>
	);
}

// ─── Detail Sheet ───
function PluginDetailSheet({
	row,
	busy,
	updating,
	onToggleEnabled,
	onTogglePermission,
	onToggleCommand,
	onUpdate,
	onReload,
	onUninstall,
}: {
	row: PluginRow;
	busy: boolean;
	updating: boolean;
	onToggleEnabled: (pluginId: string, enabled: boolean) => void;
	onTogglePermission: (pluginId: string, permission: PluginPermission, granted: boolean) => void;
	onToggleCommand: (pluginId: string, command: string, granted: boolean) => void;
	onUpdate: (row: PluginRow) => void;
	onReload: (pluginId: string) => void;
	onUninstall: (plugin: InstalledPlugin) => void;
}): JSX.Element {
	const plugin = row.installed;
	const tr = usePluginI18n();
	const { t } = useTranslation("skills");
	if (!plugin) return <div />;
	const isSystem = plugin.source === "system";
	const hasPendingVersion = Boolean(plugin.pendingVersion);
	const name = tr(plugin, plugin.name);
	const description = tr(plugin, plugin.description);

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
			{/* Identity */}
			<div className="flex items-start gap-3">
				<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
					<span className="icon-[mdi--puzzle-outline] h-5 w-5" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="text-[15px] font-semibold text-foreground">{name}</h2>
						{isSystem && (
							<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{t("plugin.badge.system")}</span>
						)}
						{hasPendingVersion && (
							<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
								{t("plugin.detail.reloadable", { version: plugin.pendingVersion })}
							</span>
						)}
					</div>
					<span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
						{plugin.id}
					</span>
				</div>
			</div>

			{description && (
				<p className="mt-4 text-[12px] leading-[1.6] text-muted-foreground">{description}</p>
			)}

			{/* Update banner */}
			{row.needsUpdate && (
				<div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
					<div className="min-w-0">
						<div className="text-[12px] font-medium text-amber-500">{t("plugin.detail.newVersion", { version: row.market?.version })}</div>
						<div className="text-[11px] text-muted-foreground">{t("plugin.detail.current", { version: plugin.activeVersion })}</div>
					</div>
					<button
						type="button"
						disabled={busy}
						onClick={() => onUpdate(row)}
						className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-500/90 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
					>
						{updating ? (
							<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
						) : (
							<span className="icon-[mdi--download] h-3.5 w-3.5" />
						)}
						{t("actions.update")}
					</button>
				</div>
			)}

			{/* Meta */}
			<div className="mt-4 grid grid-cols-2 gap-2 text-[12px]">
				<div className="rounded-lg bg-muted px-3 py-2">
					<div className="text-muted-foreground/60">{t("plugin.detail.currentVersion")}</div>
					<div className="mt-0.5 font-medium tabular-nums text-foreground">{plugin.activeVersion}</div>
				</div>
				<div className="rounded-lg bg-muted px-3 py-2">
					<div className="text-muted-foreground/60">{t("plugin.detail.source")}</div>
					<div className="mt-0.5 font-medium text-foreground">{t(pluginSourceKey(plugin.source))}</div>
				</div>
				{plugin.author && (
					<div className="rounded-lg bg-muted px-3 py-2">
						<div className="text-muted-foreground/60">{t("plugin.detail.author")}</div>
						<div className="mt-0.5 truncate font-medium text-foreground">{plugin.author}</div>
					</div>
				)}
			</div>

			{/* Enable */}
			<div className="mt-5 flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
				<div>
					<div className="text-[13px] font-medium text-foreground">{t("plugin.detail.enablePlugin")}</div>
					<div className="text-[11px] text-muted-foreground">{plugin.enabled ? t("plugin.status.enabled") : t("plugin.status.disabled")}</div>
				</div>
				<Switch
					checked={plugin.enabled}
					disabled={busy}
					onCheckedChange={(checked) => onToggleEnabled(plugin.id, checked)}
				/>
			</div>

			{/* Permissions */}
			<div className="mt-5">
				<div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-foreground">
					{t("plugin.detail.permissions")}
					{isSystem && (
						<span className="text-[11px] font-normal text-muted-foreground">{t("plugin.detail.permissionsSystemHint")}</span>
					)}
				</div>
				{plugin.permissions.length > 0 ? (
					<div className="flex flex-col gap-1.5">
						{plugin.permissions.map((permission) =>
							isSystem ? (
								<span
									key={permission}
									className="flex items-center gap-1.5 rounded-lg border border-border bg-background/50 px-2.5 py-2 text-[12px] text-muted-foreground"
								>
									<span className="icon-[mdi--lock-outline] h-3.5 w-3.5" />
									{t(PERMISSION_LABEL_KEYS[permission])}
								</span>
							) : (
								<label
									key={permission}
									className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/50 px-2.5 py-2"
								>
									<span className="text-[12px] text-foreground">{t(PERMISSION_LABEL_KEYS[permission])}</span>
									<Switch
										checked={plugin.grantedPermissions.includes(permission)}
										disabled={busy}
										onCheckedChange={(checked) => onTogglePermission(plugin.id, permission, checked)}
									/>
								</label>
							),
						)}
					</div>
				) : (
					<div className="text-[12px] text-muted-foreground">{t("plugin.detail.noPermissions")}</div>
				)}
			</div>

			{/* Declared commands — toggleable even for system plugins */}
			{plugin.declaredCommands.length > 0 && (
				<div className="mt-5">
					<div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-foreground">
						{t("plugin.detail.commands")}
						<span className="text-[11px] font-normal text-muted-foreground">{t("plugin.detail.commandsHint")}</span>
					</div>
					<div className="flex flex-col gap-1.5">
						{plugin.declaredCommands.map((command) => (
							<label
								key={command}
								className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/50 px-2.5 py-2"
							>
								<span className="flex items-center gap-1.5 text-[12px] text-foreground">
									<span className="icon-[mdi--console] h-3.5 w-3.5 text-muted-foreground" />
									<code className="font-mono">{command}</code>
								</span>
								<Switch
									checked={plugin.grantedCommandNames.includes(command)}
									disabled={busy}
									onCheckedChange={(checked) => onToggleCommand(plugin.id, command, checked)}
								/>
							</label>
						))}
					</div>
				</div>
			)}

			{/* Actions */}
			{!isSystem && (
				<div className="mt-6 flex flex-wrap gap-2">
					<button
						type="button"
						disabled={busy}
						onClick={() => onReload(plugin.id)}
						className="flex items-center gap-1.5 rounded-lg border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
					>
						<span className="icon-[mdi--reload] h-3.5 w-3.5 text-muted-foreground" />
						{t("actions.reload")}
					</button>
					<button
						type="button"
						disabled={busy}
						onClick={() => onUninstall(plugin)}
						className="flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-[12px] text-destructive transition-colors hover:bg-destructive/15 disabled:opacity-50"
					>
						<span className="icon-[mdi--delete-outline] h-3.5 w-3.5" />
						{t("actions.uninstall")}
					</button>
				</div>
			)}
		</div>
	);
}

// ─── Main panel ───
export interface PluginsPanelHandle {
	triggerImport: () => void;
}

export const PluginsPanel = forwardRef<PluginsPanelHandle>(function PluginsPanel(_props, ref): JSX.Element {
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const tr = usePluginI18n();
	const { t } = useTranslation("skills");
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

	useImperativeHandle(ref, () => ({ triggerImport: () => fileInputRef.current?.click() }), []);

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
				return t("plugin.message.installed", { name: plugin.name, version: plugin.version });
			});
		},
		[runOperation],
	);

	const handleInstallFromMarket = useCallback(
		(row: PluginRow) => {
			if (busy !== null) return;
			void runOperation(`install:${row.id}`, async () => {
				if (!token) throw new Error(t("error.notLoggedIn"));
				const buffer = await downloadPlugin(token, row.id);
				const plugin = await window.vetta.plugins.installFromArchive(buffer, { source: "remote" });
				return t("plugin.message.installed", { name: plugin.name, version: plugin.version });
			});
		},
		[busy, token, runOperation],
	);

	const handleToggleEnabled = useCallback(
		(pluginId: string, enabled: boolean) => {
			void runOperation(`enable:${pluginId}`, async () => {
				await window.vetta.plugins.setEnabled(pluginId, enabled);
				return enabled ? t("plugin.message.enabled") : t("plugin.message.disabled");
			});
		},
		[runOperation],
	);

	const handleTogglePermission = useCallback(
		(pluginId: string, permission: PluginPermission, granted: boolean) => {
			void runOperation(`permission:${pluginId}:${permission}`, async () => {
				if (granted) {
					await window.vetta.plugins.grantPermissions(pluginId, [permission]);
					return t("plugin.message.permissionGranted");
				}
				await window.vetta.plugins.revokePermissions(pluginId, [permission]);
				return t("plugin.message.permissionRevoked");
			});
		},
		[runOperation],
	);

	const handleToggleCommand = useCallback(
		(pluginId: string, command: string, granted: boolean) => {
			void runOperation(`command:${pluginId}:${command}`, async () => {
				if (granted) {
					await window.vetta.plugins.grantCommands(pluginId, [command]);
					return t("plugin.message.commandEnabled");
				}
				await window.vetta.plugins.revokeCommands(pluginId, [command]);
				return t("plugin.message.commandDisabled");
			});
		},
		[runOperation],
	);

	const handleReload = useCallback(
		(pluginId: string) => {
			void runOperation(`reload:${pluginId}`, async () => {
				const plugin = await window.vetta.plugins.reload(pluginId);
				return t("plugin.message.reloaded", { name: plugin.name, version: plugin.activeVersion });
			});
		},
		[runOperation],
	);

	const handleUninstall = useCallback(
		(plugin: InstalledPlugin) => {
			setConfirmDialog({
				title: t("plugin.confirm.uninstallTitle"),
				message: t("plugin.confirm.uninstallMessage", { name: plugin.name }),
				confirmLabel: t("actions.uninstall"),
				variant: "danger",
				onConfirm: () => {
					setSelectedId(null);
					void runOperation(`uninstall:${plugin.id}`, async () => {
						await window.vetta.plugins.uninstall(plugin.id);
						return t("plugin.message.uninstalled");
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

	const renderCard = (row: PluginRow): JSX.Element => (
		<PluginCard
			key={row.id}
			row={row}
			installing={busy === `install:${row.id}`}
			onSelect={(r) => setSelectedId(r.id)}
			onInstall={handleInstallFromMarket}
		/>
	);

	return (
		<div className="flex flex-col gap-5">
			<input
				ref={fileInputRef}
				type="file"
				accept=".zip,application/zip"
				className="hidden"
				onChange={handleArchiveSelected}
			/>

			{error && (
				<div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-[12px] text-destructive">
					{error}
				</div>
			)}
			{message && (
				<div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-[12px] text-emerald-500">
					{message}
				</div>
			)}

			{/* Plugin grid */}
			{loading ? (
				<div className="flex flex-col items-center justify-center gap-3 py-16 opacity-60">
					<motion.span
						className="icon-[mdi--loading] h-7 w-7 text-primary/60"
						animate={{ rotate: 360 }}
						transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
					/>
					<p className="text-[13px] text-muted-foreground/60">{t("loading")}</p>
				</div>
			) : mainRows.length === 0 && systemRows.length === 0 ? (
				<motion.div
					className="flex flex-col items-center justify-center gap-5 py-16 text-center"
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5, ease: easeOut }}
				>
					<div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-inset ring-primary/20">
						<span className="absolute inset-0 rounded-3xl bg-primary/10 blur-2xl" />
						<span className="icon-[mdi--puzzle-outline] relative text-4xl text-primary/80" />
					</div>
					<div className="space-y-1.5">
						<p className="text-[15px] font-semibold text-foreground">{t("empty.noPlugins")}</p>
						<p className="text-[12px] text-muted-foreground/60">
							{token ? t("empty.pluginsHint") : t("empty.pluginsHintGuest")}
						</p>
					</div>
				</motion.div>
			) : (
				<>
					{mainRows.length > 0 && (
						<motion.div
							className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5"
							initial="hidden"
							animate="show"
							variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
						>
							{mainRows.map(renderCard)}
						</motion.div>
					)}

					{/* 系统插件：单独沉底、默认折叠，展开后与主网格同样式。 */}
					{systemRows.length > 0 && (
						<div className="flex flex-col gap-2.5">
							<button
								type="button"
								onClick={() => setSystemExpanded((v) => !v)}
								className="flex items-center gap-2 rounded-lg px-1 py-1 text-left text-[12px] font-medium text-muted-foreground/70 transition-colors hover:text-foreground"
							>
								<span
									className={`icon-[mdi--chevron-right] h-4 w-4 transition-transform ${
										systemExpanded ? "rotate-90" : ""
									}`}
								/>
								<span>{t("group.systemPlugins")}</span>
								<span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground/60">
									{systemRows.length}
								</span>
							</button>
							{systemExpanded && (
								<motion.div
									className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5"
									initial="hidden"
									animate="show"
									variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
								>
									{systemRows.map(renderCard)}
								</motion.div>
							)}
						</div>
					)}
				</>
			)}

			{/* Detail sheet */}
			<Drawer
				direction="right"
				open={selected !== null}
				onOpenChange={(open) => {
					if (!open) setSelectedId(null);
				}}
			>
				<DrawerContent className="border-l-0 sm:max-w-md">
					{selected && (
						<>
							<DrawerHeader className="border-b border-border">
								<DrawerTitle>{t("plugin.detail.title")}</DrawerTitle>
								<DrawerDescription>{t("plugin.detail.subtitle", { name: tr(selected.installed ?? undefined, selected.name) })}</DrawerDescription>
							</DrawerHeader>
							<PluginDetailSheet
								row={selected}
								busy={busy !== null}
								updating={busy === `install:${selected.id}`}
								onToggleEnabled={handleToggleEnabled}
								onTogglePermission={handleTogglePermission}
								onToggleCommand={handleToggleCommand}
								onUpdate={handleInstallFromMarket}
								onReload={handleReload}
								onUninstall={handleUninstall}
							/>
						</>
					)}
				</DrawerContent>
			</Drawer>
		</div>
	);
});
