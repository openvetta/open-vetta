import { PluginCardView } from "@vetta/theme-ui/skills";
import type { InstalledPlugin, PluginPermission } from "@preload/api";
import { Switch } from "@vetta/ui";
import { useTranslation } from "react-i18next";
import { usePluginI18n } from "../../plugins/runtime/plugin-i18n";
import { PERMISSION_LABEL_KEYS, type PluginRow, pluginSourceKey } from "../hooks/usePluginsPanelModel";

export function PluginDetailSheet({
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
			<div className="flex items-start gap-3">
				<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
					<span className="icon-[mdi--puzzle-outline] h-5 w-5" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="text-[15px] font-semibold text-foreground">{name}</h2>
						{isSystem && (
							<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
								{t("plugin.badge.system")}
							</span>
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

			{row.needsUpdate && (
				<div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
					<div className="min-w-0">
						<div className="text-[12px] font-medium text-amber-500">
							{t("plugin.detail.newVersion", { version: row.market?.version })}
						</div>
						<div className="text-[11px] text-muted-foreground">
							{t("plugin.detail.current", { version: plugin.activeVersion })}
						</div>
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

			<div className="mt-5 flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
				<div>
					<div className="text-[13px] font-medium text-foreground">{t("plugin.detail.enablePlugin")}</div>
					<div className="text-[11px] text-muted-foreground">
						{plugin.enabled ? t("plugin.status.enabled") : t("plugin.status.disabled")}
					</div>
				</div>
				<Switch
					checked={plugin.enabled}
					disabled={busy}
					onCheckedChange={(checked) => onToggleEnabled(plugin.id, checked)}
				/>
			</div>

			<div className="mt-5">
				<div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-foreground">
					{t("plugin.detail.permissions")}
					{isSystem && (
						<span className="text-[11px] font-normal text-muted-foreground">
							{t("plugin.detail.permissionsSystemHint")}
						</span>
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

			{plugin.declaredCommands.length > 0 && (
				<div className="mt-5">
					<div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-foreground">
						{t("plugin.detail.commands")}
						<span className="text-[11px] font-normal text-muted-foreground">
							{t("plugin.detail.commandsHint")}
						</span>
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

export type ThemeUiLink_PluginCardView = typeof PluginCardView;
