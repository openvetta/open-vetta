import { useSetAtom } from "jotai";
import { motion } from "motion/react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { InstalledPlugin, PluginPermission } from "@preload/api";
import { confirmDialogAtom } from "@shared/store/atoms";
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
	"agent.session.read": "读取 Agent 会话",
	"agent.session.write": "修改 Agent 会话",
	"agent.command.run": "执行 Agent 命令",
	"fs.read": "读取文件",
	"fs.write": "写入文件",
	"network.fetch": "访问网络",
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

// ─── Plugin Card ───
function PluginCard({
	plugin,
	onSelect,
}: {
	plugin: InstalledPlugin;
	onSelect: (plugin: InstalledPlugin) => void;
}): JSX.Element {
	const isSystem = plugin.source === "system";

	return (
		<motion.div
			variants={{
				hidden: { opacity: 0, y: 10, scale: 0.98 },
				show: { opacity: 1, y: 0, scale: 1 },
			}}
			transition={{ type: "spring", stiffness: 280, damping: 26 }}
			whileHover={{ y: -2 }}
			onClick={() => onSelect(plugin)}
			className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl bg-muted transition-colors duration-200 hover:bg-accent"
		>
			<div className="flex flex-1 flex-col gap-2 px-3.5 pt-3 pb-3">
				<div className="flex items-start gap-2.5">
					<div
						className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
							plugin.enabled
								? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
								: "bg-accent/50 text-muted-foreground/70"
						}`}
					>
						<span className="icon-[mdi--puzzle-outline] h-4 w-4" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-baseline gap-2">
							<h4 className="truncate text-[13px] font-semibold tracking-tight text-foreground">
								{plugin.name}
							</h4>
							<span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/45">
								v{plugin.activeVersion}
							</span>
						</div>
						<p className="mt-0.5 line-clamp-2 text-[12px] leading-[1.5] text-muted-foreground/65">
							{plugin.description || "暂无描述"}
						</p>
					</div>
				</div>

				<div className="mt-auto flex items-center gap-2 pt-2">
					<div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
						<span
							className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-semibold ${
								plugin.enabled
									? "bg-emerald-500/15 text-emerald-400"
									: "bg-accent/60 text-muted-foreground"
							}`}
						>
							<span
								className={`h-1.5 w-1.5 rounded-full ${
									plugin.enabled ? "bg-emerald-400" : "bg-muted-foreground/60"
								}`}
							/>
							{plugin.enabled ? "已启用" : "已停用"}
						</span>
						{isSystem && (
							<span className="inline-flex h-5 shrink-0 items-center rounded-full bg-primary/10 px-2 text-[10px] font-semibold text-primary">
								系统
							</span>
						)}
						{plugin.author && (
							<span className="truncate text-[11px] text-muted-foreground/55">{plugin.author}</span>
						)}
					</div>
					<span className="icon-[mdi--chevron-right] h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
				</div>
			</div>
		</motion.div>
	);
}

// ─── Detail Sheet ───
function PluginDetailSheet({
	plugin,
	busy,
	onToggleEnabled,
	onTogglePermission,
	onReload,
	onUninstall,
}: {
	plugin: InstalledPlugin;
	busy: boolean;
	onToggleEnabled: (pluginId: string, enabled: boolean) => void;
	onTogglePermission: (pluginId: string, permission: PluginPermission, granted: boolean) => void;
	onReload: (pluginId: string) => void;
	onUninstall: (plugin: InstalledPlugin) => void;
}): JSX.Element {
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
				{plugin.availableVersion && plugin.availableVersion !== plugin.activeVersion && (
					<div className="rounded-lg bg-muted px-3 py-2">
						<div className="text-muted-foreground/60">已安装版本</div>
						<div className="mt-0.5 font-medium tabular-nums text-foreground">{plugin.availableVersion}</div>
					</div>
				)}
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
	const setConfirmDialog = useSetAtom(confirmDialogAtom);
	const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useImperativeHandle(ref, () => ({ triggerImport: () => fileInputRef.current?.click() }), []);

	const refresh = useCallback(async () => {
		setPlugins(await window.vetta.plugins.list());
	}, []);

	useEffect(() => {
		void refresh()
			.catch((err: unknown) => setError(getErrorMessage(err)))
			.finally(() => setLoading(false));
	}, [refresh]);

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

	const currentBusy = busy !== null;
	const selected = plugins.find((p) => p.id === selectedId) ?? null;

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
			) : plugins.length === 0 ? (
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
						<p className="text-[15px] font-semibold text-foreground">还没有安装插件</p>
						<p className="text-[12px] text-muted-foreground/60">从本地或远程 zip 安装可信插件</p>
					</div>
				</motion.div>
			) : (
				<motion.div
					className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5"
					initial="hidden"
					animate="show"
					variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
				>
					{plugins.map((plugin) => (
						<PluginCard key={plugin.id} plugin={plugin} onSelect={(p) => setSelectedId(p.id)} />
					))}
				</motion.div>
			)}

			{/* Detail sheet */}
			<Drawer
				direction="right"
				open={selected !== null}
				onOpenChange={(open) => {
					if (!open) setSelectedId(null);
				}}
			>
				<DrawerContent className="sm:max-w-md">
					{selected && (
						<>
							<DrawerHeader className="border-b border-border">
								<DrawerTitle>插件详情</DrawerTitle>
								<DrawerDescription>查看并配置「{selected.name}」</DrawerDescription>
							</DrawerHeader>
							<PluginDetailSheet
								plugin={selected}
								busy={currentBusy}
								onToggleEnabled={handleToggleEnabled}
								onTogglePermission={handleTogglePermission}
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
