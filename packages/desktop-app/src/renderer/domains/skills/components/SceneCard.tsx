import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@shared/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/components/ui/popover";
import type { ActionState, MergedSkill } from "../hooks/useSkillsPageModel";
import { SkillToggleSwitch } from "./SkillToggleSwitch";

export function SceneCard({
	scene,
	onInstall,
	onToggle,
	onUninstall,
	onPreview,
	actionState,
}: {
	scene: MergedSkill;
	onInstall: (s: MergedSkill) => void;
	onToggle: (name: string) => void;
	onUninstall: (name: string, type: "skill" | "scene") => void;
	onPreview?: (scene: MergedSkill) => void;
	actionState: ActionState;
}): JSX.Element {
	const { t } = useTranslation("skills");
	const isLoading = actionState === "loading";
	const previewable = !!onPreview;

	return (
		<motion.div
			variants={{
				hidden: { opacity: 0, y: 10, scale: 0.98 },
				show: { opacity: 1, y: 0, scale: 1 },
			}}
			transition={{ type: "spring", stiffness: 280, damping: 26 }}
			whileHover={{ y: -2 }}
			onClick={previewable ? () => onPreview?.(scene) : undefined}
			className={`group relative flex flex-col overflow-hidden rounded-xl bg-muted transition-colors duration-200 hover:bg-accent ${
				previewable ? "cursor-pointer" : ""
			}`}
		>
			<div className="flex flex-1 flex-col gap-2 px-3.5 pt-3 pb-3">
				<div className="flex items-start gap-2.5">
					<div
						className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
							scene.installed
								? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
								: "bg-accent/50 text-muted-foreground/70"
						}`}
					>
						<span className="icon-[mdi--movie-open-outline] h-4 w-4" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-baseline gap-2">
							<h4 className="truncate text-[13px] font-semibold tracking-tight text-foreground">
								{scene.alias || scene.name}
							</h4>
							{scene.installed && scene.localVersion && (
								<span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/45">
									v{scene.localVersion}
								</span>
							)}
						</div>
						<p className="mt-0.5 line-clamp-2 text-[12px] leading-[1.5] text-muted-foreground/65">
							{scene.description || t("card.noDescription")}
						</p>
					</div>
				</div>

				<div className="mt-auto flex items-center gap-2 pt-2">
					<div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
						{scene.isAgent ? (
							<span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-accent/60 px-2 text-[10px] font-semibold text-muted-foreground/80">
								<span className="icon-[mdi--earth] h-2.5 w-2.5" />
								{t("scene.generalReadonly")}
							</span>
						) : (
							scene.installed && (
								<span
									className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-semibold ${
										scene.enabled
											? "bg-emerald-500/15 text-emerald-400"
											: "bg-accent/60 text-muted-foreground"
									}`}
								>
									<span
										className={`h-1.5 w-1.5 rounded-full ${
											scene.enabled ? "bg-emerald-400" : "bg-muted-foreground/60"
										}`}
									/>
									{scene.enabled ? t("scene.running") : t("scene.installed")}
								</span>
							)
						)}
						{scene.needsUpdate && (
							<span className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-400">
								<span className="icon-[mdi--arrow-up-bold] h-2.5 w-2.5" />
								{t("card.updatable")}
							</span>
						)}
						{scene.tags.slice(0, 2).map((t) => (
							<span
								key={t}
								className="shrink-0 truncate rounded-full bg-accent/50 px-2 py-0.5 text-[10px] text-muted-foreground/70"
							>
								{t}
							</span>
						))}
					</div>
					<div className="ml-auto flex shrink-0 items-center gap-1.5">
						{scene.isAgent ? (
							<span className="flex h-7 items-center gap-1 px-1.5 text-[11px] text-muted-foreground/50">
								<span className="icon-[mdi--lock-outline] h-3.5 w-3.5" />
								{t("card.readonly")}
							</span>
						) : scene.installed ? (
							<>
								<Popover>
									<PopoverTrigger asChild>
										<button
											type="button"
											onClick={(e) => e.stopPropagation()}
											className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 opacity-60 transition-all group-hover:opacity-100 hover:bg-primary/10 hover:text-primary"
										>
											<span className="icon-[mdi--dots-horizontal] h-4 w-4" />
										</button>
									</PopoverTrigger>
									<PopoverContent align="end" className="w-36 p-1">
										{scene.needsUpdate && (
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													onInstall(scene);
												}}
												disabled={isLoading}
												className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
											>
												<span className="icon-[mdi--update] h-4 w-4 text-primary" />
												{t("actions.update")}
											</button>
										)}
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												onUninstall(scene.name, scene.type);
											}}
											disabled={isLoading}
											className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
										>
											<span className="icon-[mdi--delete-outline] h-4 w-4" />
											{t("actions.uninstall")}
										</button>
									</PopoverContent>
								</Popover>
								<SkillToggleSwitch
									checked={scene.enabled}
									onChange={() => onToggle(scene.name)}
									disabled={isLoading}
								/>
							</>
						) : (
							<Button
								type="button"
								variant="primary"
								size="sm"
								onClick={(e) => {
									e.stopPropagation();
									onInstall(scene);
								}}
								disabled={isLoading}
							>
								{isLoading ? (
									<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
								) : (
									<span className="icon-[mdi--play] h-3.5 w-3.5" />
								)}
								<span>{t("actions.use")}</span>
							</Button>
						)}
					</div>
				</div>
			</div>
		</motion.div>
	);
}
