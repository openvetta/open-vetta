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
import { notifyPluginsChanged } from "../../plugins/runtime/plugin-events";

const easeOut = [0.22, 1, 0.36, 1] as const;

const PERMISSION_LABELS: Record<PluginPermission, string> = {
	"ui.slot.global": "全局 UI Slot",
	"ui.slot.file-preview": "文件预览 Slot",
	"ui.slot.activity-tab": "活动面板 Tab",
	"ui.slot.input-action": "输入栏动作 Slot",
	"ui.slot.message": "消息下方 Slot",
	"ui.slot.tool-call": "工具调用渲染 Slot",
	"agent.session.read": "读取 Agent 会话",
	"agent.session.write": "修改 Agent 会话",
	"agent.command.run": "执行 Agent 命令",
	"agent.systemPrompt.read": "读取 Agent 系统提示词",
	"agent.systemPrompt.write": "修改 Agent 系统提示词",
	"agent.systemPrompt.fullControl": "完全控制 Agent 系统提示词",
	"agent.skills.control": "控制 Agent 技能加载",
	"agent.tools.control": "控制 Agent 工具加载",
	"agent.tools.register": "注册 Agent 工具",
	"agent.toolHandler.execute": "执行插件工具处理器",
	"agent.state.read": "读取插件 Agent 状态",
	"agent.state.write": "写入插件 Agent 状态",
	"agent.continuation.register": "注册 Agent 自动续跑策略",
	"agent.runtime.configure": "配置 Agent 运行时",
	"fs.read": "读取文件",
	"fs.write": "写入文件",
	"network.fetch": "访问网络",
	"images.generate": "生成图像",
	"settings.read": "读取设置",
	"settings.write": "修改设置",
};

function formatPluginSource(source: InstalledPlugin["source"]): string {
	if (source === "remote") return "远程安装";
	if (source === "system") return "系统内置";
	return "本地 zip";
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
								{row.name}
							</h4>
							<span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/45">
								v{row.version}
							</span>
						</div>
						<p className="mt-0.5 line-clamp-2 text-[12px] leading-[1.5] text-muted-foreground/65">
							{row.description || "暂无描述"}
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
								{enabled ? "已启用" : "已停用"}
							</span>
						) : (
							<span className="inline-flex h-5 shrink-0 items-center rounded-full bg-accent/60 px-2 text-[10px] font-semibold text-muted-foreground">
								未安装
							</span>
						)}
						{isSystem && (
							<span className="inline-flex h-5 shrink-0 items-center rounded-full bg-primary/10 px-2 text-[10px] font-semibold text-primary">
								系统
							</span>
						)}
						{row.needsUpdate && (
							<span className="inline-flex h-5 shrink-0 items-center rounded-full bg-amber-500/15 px-2 text-[10px] font-semibold text-amber-500">
								可更新 v{row.market?.version}
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
							安装
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
	if (!plugin) return <div />;
	const isSystem = plugin.source === "system";
	const hasPendingVersion = Boolean(plugin.pendingVersion);

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
			{/* Identity */}
			<div className="flex items-start gap-3">
				<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
					<span className="icon-[mdi--puzzle-outline] h-5 w-5" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="text-[15px] font-semibold text-foreground">{plugin.name}</h2>
						{isSystem && (
							<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">系统</span>
						)}
						{hasPendingVersion && (
							<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
								可重载到 {plugin.pendingVersion}
							</span>
						)}
					</div>
					<span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
						{plugin.id}
					</span>
				</div>
			</div>

			{plugin.description && (
				<p className="mt-4 text-[12px] leading-[1.6] text-muted-foreground">{plugin.description}</p>
			)}

			{/* Update banner */}
			{row.needsUpdate && (
				<div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
					<div className="min-w-0">
						<div className="text-[12px] font-medium text-amber-500">市场有新版本 v{row.market?.version}</div>
						<div className="text-[11px] text-muted-foreground">当前 v{plugin.activeVersion}</div>
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
						更新
					</button>
				</div>
			)}

			{/* Meta */}
			<div className="mt-4 grid grid-cols-2 gap-2 text-[12px]">
				<div className="rounded-lg bg-muted px-3 py-2">
					<div className="text-muted-foreground/60">当前版本</div>
					<div className="mt-0.5 font-medium tabular-nums text-foreground">{plugin.activeVersion}</div>
				</div>
				<div className="rounded-lg bg-muted px-3 py-2">
					<div className="text-muted-foreground/60">来源</div>
					<div className="mt-0.5 font-medium text-foreground">{formatPluginSource(plugin.source)}</div>
				</div>
				{plugin.author && (
					<div className="rounded-lg bg-muted px-3 py-2">
						<div className="text-muted-foreground/60">作者</div>
						<div className="mt-0.5 truncate font-medium text-foreground">{plugin.author}</div>
					</div>
				)}
			</div>

			{/* Enable */}
			<div className="mt-5 flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
				<div>
					<div className="text-[13px] font-medium text-foreground">启用插件</div>
					<div className="text-[11px] text-muted-foreground">{plugin.enabled ? "已启用" : "已停用"}</div>
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
					权限
					{isSystem && (
						<span className="text-[11px] font-normal text-muted-foreground">系统插件自动授予，不可更改</span>
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
									{PERMISSION_LABELS[permission]}
								</span>
							) : (
								<label
									key={permission}
									className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/50 px-2.5 py-2"
								>
									<span className="text-[12px] text-foreground">{PERMISSION_LABELS[permission]}</span>
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
					<div className="text-[12px] text-muted-foreground">该插件没有声明权限。</div>
				)}
			</div>

			{/* Declared commands — toggleable even for system plugins */}
			{plugin.declaredCommands.length > 0 && (
				<div className="mt-5">
					<div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-foreground">
						可执行命令
						<span className="text-[11px] font-normal text-muted-foreground">关闭后插件调用将被拦截</span>
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
						重载
					</button>
					<button
						type="button"
						disabled={busy}
						onClick={() => onUninstall(plugin)}
						className="flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-[12px] text-destructive transition-colors hover:bg-destructive/15 disabled:opacity-50"
					>
						<span className="icon-[mdi--delete-outline] h-3.5 w-3.5" />
						卸载
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
				return `已安装 ${plugin.name} ${plugin.version}`;
			});
		},
		[runOperation],
	);

	const handleInstallFromMarket = useCallback(
		(row: PluginRow) => {
			if (busy !== null) return;
			void runOperation(`install:${row.id}`, async () => {
				if (!token) throw new Error("未登录，无法安装插件");
				const buffer = await downloadPlugin(token, row.id);
				const plugin = await window.vetta.plugins.installFromArchive(buffer, { source: "remote" });
				return `已安装 ${plugin.name} ${plugin.version}`;
			});
		},
		[busy, token, runOperation],
	);

	const handleToggleEnabled = useCallback(
		(pluginId: string, enabled: boolean) => {
			void runOperation(`enable:${pluginId}`, async () => {
				await window.vetta.plugins.setEnabled(pluginId, enabled);
				return enabled ? "插件已启用。" : "插件已停用。";
			});
		},
		[runOperation],
	);

	const handleTogglePermission = useCallback(
		(pluginId: string, permission: PluginPermission, granted: boolean) => {
			void runOperation(`permission:${pluginId}:${permission}`, async () => {
				if (granted) {
					await window.vetta.plugins.grantPermissions(pluginId, [permission]);
					return "权限已授予。";
				}
				await window.vetta.plugins.revokePermissions(pluginId, [permission]);
				return "权限已撤销。";
			});
		},
		[runOperation],
	);

	const handleToggleCommand = useCallback(
		(pluginId: string, command: string, granted: boolean) => {
			void runOperation(`command:${pluginId}:${command}`, async () => {
				if (granted) {
					await window.vetta.plugins.grantCommands(pluginId, [command]);
					return "命令已启用。";
				}
				await window.vetta.plugins.revokeCommands(pluginId, [command]);
				return "命令已关闭。";
			});
		},
		[runOperation],
	);

	const handleReload = useCallback(
		(pluginId: string) => {
			void runOperation(`reload:${pluginId}`, async () => {
				const plugin = await window.vetta.plugins.reload(pluginId);
				return `已重载 ${plugin.name} ${plugin.activeVersion}`;
			});
		},
		[runOperation],
	);

	const handleUninstall = useCallback(
		(plugin: InstalledPlugin) => {
			setConfirmDialog({
				title: "卸载插件",
				message: `确定卸载插件「${plugin.name}」吗？该插件的 UI 会立即移除。`,
				confirmLabel: "卸载",
				variant: "danger",
				onConfirm: () => {
					setSelectedId(null);
					void runOperation(`uninstall:${plugin.id}`, async () => {
						await window.vetta.plugins.uninstall(plugin.id);
						return "插件已卸载。";
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
					<p className="text-[13px] text-muted-foreground/60">加载中...</p>
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
						<p className="text-[15px] font-semibold text-foreground">还没有可用插件</p>
						<p className="text-[12px] text-muted-foreground/60">
							{token ? "从本地 zip 安装，或稍后再来看看市场" : "登录后可浏览插件市场"}
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
								<span>系统插件</span>
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
								<DrawerTitle>插件详情</DrawerTitle>
								<DrawerDescription>查看并配置「{selected.name}」</DrawerDescription>
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
