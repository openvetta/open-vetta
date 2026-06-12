import { useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { InstalledPlugin, PluginPermission } from "@preload/api";
import { confirmDialogAtom } from "@shared/store/atoms";
import { Switch } from "@shared/components/ui/switch";
import { notifyPluginsChanged } from "../../plugins/runtime/plugin-events";
import { SETTINGS_SECTION } from "../registry";
import { SettingRow, SettingSection } from "./shared";

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
	return source === "remote" ? "远程安装" : "本地 zip";
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function PluginPermissionToggle({
	plugin,
	permission,
	busy,
	onToggle,
}: {
	plugin: InstalledPlugin;
	permission: PluginPermission;
	busy: boolean;
	onToggle: (pluginId: string, permission: PluginPermission, granted: boolean) => void;
}): JSX.Element {
	const granted = plugin.grantedPermissions.includes(permission);
	return (
		<label className="flex items-center gap-2 rounded-lg border border-border bg-background/50 px-2.5 py-1.5">
			<Switch
				checked={granted}
				disabled={busy}
				onCheckedChange={(checked) => onToggle(plugin.id, permission, checked)}
			/>
			<span className="text-[12px] text-foreground">{PERMISSION_LABELS[permission]}</span>
		</label>
	);
}

function PluginCard({
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
	const hasPendingVersion = Boolean(plugin.pendingVersion);
	const permissionList = plugin.permissions.length > 0 ? plugin.permissions : [];

	return (
		<div className="border-b border-border px-5 py-4 last:border-b-0">
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<h3 className="truncate text-[13px] font-medium text-foreground">{plugin.name}</h3>
						<span className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
							{plugin.id}
						</span>
						{hasPendingVersion && (
							<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
								可重载到 {plugin.pendingVersion}
							</span>
						)}
					</div>
					<div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
						<span>当前版本 {plugin.activeVersion}</span>
						{plugin.availableVersion && plugin.availableVersion !== plugin.activeVersion && (
							<span>已安装版本 {plugin.availableVersion}</span>
						)}
						<span>{formatPluginSource(plugin.source)}</span>
						{plugin.author && <span>{plugin.author}</span>}
					</div>
					{plugin.description && (
						<p className="mt-2 text-[12px] text-muted-foreground">{plugin.description}</p>
					)}
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<span className="text-[12px] text-muted-foreground">{plugin.enabled ? "已启用" : "已停用"}</span>
					<Switch
						checked={plugin.enabled}
						disabled={busy}
						onCheckedChange={(checked) => onToggleEnabled(plugin.id, checked)}
					/>
				</div>
			</div>

			<div className="mt-4">
				<div className="mb-2 text-[12px] font-medium text-foreground">权限</div>
				{permissionList.length > 0 ? (
					<div className="flex flex-wrap gap-2">
						{permissionList.map((permission) => (
							<PluginPermissionToggle
								key={permission}
								plugin={plugin}
								permission={permission}
								busy={busy}
								onToggle={onTogglePermission}
							/>
						))}
					</div>
				) : (
					<div className="text-[12px] text-muted-foreground">该插件没有声明权限。</div>
				)}
			</div>

			<div className="mt-4 flex flex-wrap gap-2">
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
		</div>
	);
}

export function PluginSettings(): JSX.Element {
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const setConfirmDialog = useSetAtom(confirmDialogAtom);
	const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
	const [remoteUrl, setRemoteUrl] = useState("");
	const [grantGlobalOnInstall, setGrantGlobalOnInstall] = useState(true);
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		setPlugins(await window.vetta.plugins.list());
	}, []);

	useEffect(() => {
		void refresh().catch((err: unknown) => setError(getErrorMessage(err)));
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

	const installOptions = grantGlobalOnInstall
		? { grantedPermissions: ["ui.slot.global" as const] }
		: undefined;

	const handleArchiveSelected = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0];
			event.target.value = "";
			if (!file) return;
			void runOperation("install-archive", async () => {
				const plugin = await window.vetta.plugins.installFromArchive(await file.arrayBuffer(), installOptions);
				return `已安装 ${plugin.name} ${plugin.version}`;
			});
		},
		[installOptions, runOperation],
	);

	const handleInstallRemote = useCallback(() => {
		const url = remoteUrl.trim();
		if (!url) {
			setError("请输入远程 zip URL。");
			return;
		}
		void runOperation("install-remote", async () => {
			const plugin = await window.vetta.plugins.installFromUrl(url, installOptions);
			setRemoteUrl("");
			return `已安装 ${plugin.name} ${plugin.version}`;
		});
	}, [installOptions, remoteUrl, runOperation]);

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

	return (
		<div className="mx-auto w-full max-w-[760px] px-8 py-4">
			<h1 className="mb-1.5 text-[20px] font-bold text-foreground">插件</h1>
			<p className="mb-6 text-[13px] text-muted-foreground">
				从本地或远程 zip 安装可信插件，管理启用状态与权限授权。
			</p>

			{error && (
				<div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-[12px] text-destructive">
					{error}
				</div>
			)}
			{message && (
				<div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-[12px] text-emerald-500">
					{message}
				</div>
			)}

			<SettingSection
				section={SETTINGS_SECTION["plugins-install"]}
				description="安装新版本不会自动切换 UI；需要手动重载插件。"
			>
				<SettingRow
					title="安装时授予全局 UI Slot"
					description="示例插件需要该权限才能在全局 slot 渲染 UI"
				>
					<Switch checked={grantGlobalOnInstall} onCheckedChange={setGrantGlobalOnInstall} />
				</SettingRow>
				<SettingRow
					title="本地 zip"
					description="选择插件 zip 包并安装"
				>
					<div className="flex items-center gap-2">
						<input
							ref={fileInputRef}
							type="file"
							accept=".zip,application/zip"
							className="hidden"
							onChange={handleArchiveSelected}
						/>
						<button
							type="button"
							disabled={currentBusy}
							onClick={() => fileInputRef.current?.click()}
							className="flex items-center gap-1.5 rounded-lg border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
						>
							{busy === "install-archive" ? (
								<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
							) : (
								<span className="icon-[mdi--archive-outline] h-3.5 w-3.5 text-muted-foreground" />
							)}
							选择 zip
						</button>
					</div>
				</SettingRow>
				<SettingRow
					title="远程 zip"
					description="输入 zip URL，由主进程下载并安装"
					border={false}
				>
					<div className="flex min-w-[320px] items-center gap-2 @max-xl:min-w-0">
						<input
							value={remoteUrl}
							disabled={currentBusy}
							onChange={(event) => setRemoteUrl(event.target.value)}
							placeholder="https://example.com/plugin.zip"
							className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
						/>
						<button
							type="button"
							disabled={currentBusy}
							onClick={handleInstallRemote}
							className="flex shrink-0 items-center gap-1.5 rounded-lg border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
						>
							{busy === "install-remote" ? (
								<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
							) : (
								<span className="icon-[mdi--download-outline] h-3.5 w-3.5 text-muted-foreground" />
							)}
							安装
						</button>
					</div>
				</SettingRow>
			</SettingSection>

			<SettingSection section={SETTINGS_SECTION["plugins-list"]}>
				{plugins.length > 0 ? (
					plugins.map((plugin) => (
						<PluginCard
							key={plugin.id}
							plugin={plugin}
							busy={currentBusy}
							onToggleEnabled={handleToggleEnabled}
							onTogglePermission={handleTogglePermission}
							onReload={handleReload}
							onUninstall={handleUninstall}
						/>
					))
				) : (
					<div className="px-5 py-4 text-[12px] text-muted-foreground">还没有安装插件。</div>
				)}
			</SettingSection>
		</div>
	);
}
