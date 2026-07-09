import { motion } from "motion/react";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@shared/components/ui/drawer";
import { useTranslation } from "react-i18next";
import { usePluginI18n } from "../../plugins/runtime/plugin-i18n";
import type { PluginsPanelModel, PluginRow } from "../hooks/usePluginsPanelModel";
import { PluginCard } from "./PluginCard";
import { PluginDetailSheet } from "./PluginDetailSheet";

const easeOut = [0.22, 1, 0.36, 1] as const;

export function PluginsPanelView({ model }: { model: PluginsPanelModel }): JSX.Element {
	const tr = usePluginI18n();
	const { t } = useTranslation("skills");
	const {
		fileInputRef,
		token,
		busy,
		error,
		message,
		loading,
		systemExpanded,
		setSystemExpanded,
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
	} = model;

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
								<DrawerDescription>
									{t("plugin.detail.subtitle", {
										name: tr(selected.installed ?? undefined, selected.name),
									})}
								</DrawerDescription>
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
}
