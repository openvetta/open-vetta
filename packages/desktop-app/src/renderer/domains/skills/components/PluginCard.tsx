import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { usePluginI18n } from "../../plugins/runtime/plugin-i18n";
import type { PluginRow } from "../hooks/usePluginsPanelModel";

export function PluginCard({
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
