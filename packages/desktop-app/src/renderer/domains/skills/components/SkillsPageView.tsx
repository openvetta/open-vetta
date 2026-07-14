import { SkillTagGroupView } from "@vetta/theme-ui/skills";
import { motion } from "motion/react";
import { type ReactNode, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@vetta/ui";
import { useNarrowScreen } from "@shared/hooks/useNarrowScreen";
import { SettingsAiAssist } from "../../settings/ai-assist";
import { McpSettings, type McpSettingsHandle } from "../../settings/components/McpSettings";
import { UNCATEGORIZED, type SkillsPageModel, type TypeTab } from "../hooks/useSkillsPageModel";
import { SkillDetailDialog } from "./SkillDetailDialog";
import { SkillTagGroup } from "./SkillTagGroup";
import "../../settings/components/settings-highlight.css";

const easeOut = [0.22, 1, 0.36, 1] as const;

const TYPE_TAB_ITEMS: readonly { key: TypeTab; labelKey: "tabs.scene" | "tabs.skill" | "tabs.connector" }[] =
	[
		{ key: "scene", labelKey: "tabs.scene" },
		{ key: "skill", labelKey: "tabs.skill" },
		{ key: "connector", labelKey: "tabs.connector" },
	];

export function SkillsPageView({ model }: { model: SkillsPageModel }): JSX.Element {
	const { t } = useTranslation("skills");
	const typeNoun = (tab: TypeTab) => {
		if (tab === "scene") return t("typeNoun.scene");
		if (tab === "skill") return t("typeNoun.skill");
		return t("typeNoun.connector");
	};
	const {
		typeTab,
		setTypeTab,
		searchQuery,
		setSearchQuery,
		loading,
		error,
		actionStates,
		importing,
		selectedSkill,
		setSelectedSkill,
		fileInputRef,
		groups,
		customSkills,
		agentForTab,
		hasContent,
		handleInstall,
		handleToggle,
		handleUninstall,
		handlePreview,
		handleImportClick,
		handleFileChange,
	} = model;
	const narrow = useNarrowScreen();
	const subtitle = typeTab === "connector" ? t("subtitleConnector") : t("subtitle");
	const mcpSettingsRef = useRef<McpSettingsHandle>(null);
	const { t: tSettings } = useTranslation("settings");

	/** 顶栏标题区右侧插槽：按当前 Tab 填充操作（搜索/导入/AI 协助等）。 */
	const headerTrailingSlot: ReactNode = (() => {
		if (typeTab === "connector") {
			return (
				<>
					<Button
						type="button"
						variant="outline"
						onClick={() => mcpSettingsRef.current?.openCustomConnector()}
					>
						<span className="icon-[mdi--plus] h-3.5 w-3.5" />
						<span>{tSettings("mcpStore.customConnector")}</span>
					</Button>
					<SettingsAiAssist tabId="mcp" />
				</>
			);
		}
		// scene / skill：搜索；skill 额外导入
		return (
			<>
				<div className={`relative ${narrow ? "flex-1" : ""}`}>
					<span className="icon-[mdi--magnify] absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
					<input
						type="text"
						placeholder={t("search.placeholder", { noun: typeNoun(typeTab) })}
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className={`h-8 ${narrow ? "w-full" : "w-56"} rounded-full bg-muted pl-8 pr-3 text-[12px] text-foreground placeholder:text-muted-foreground/40 transition-colors hover:bg-accent focus:bg-accent focus:outline-none focus:ring-1 focus:ring-primary/30`}
					/>
				</div>
				{typeTab === "skill" && (
					<>
						<input
							ref={fileInputRef}
							type="file"
							accept=".zip,.tar.gz,.tgz,application/zip,application/gzip,application/x-gzip"
							className="hidden"
							onChange={handleFileChange}
						/>
						<Button type="button" variant="outline" onClick={handleImportClick} disabled={importing}>
							{importing ? (
								<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
							) : (
								<span className="icon-[mdi--tray-arrow-up] h-3.5 w-3.5" />
							)}
							<span>{t("actions.importSkill")}</span>
						</Button>
					</>
				)}
			</>
		);
	})();

	return (
		<div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
			<div className="relative shrink-0 px-8 pb-4">
				<div className={`flex gap-4 ${narrow ? "flex-col items-stretch" : "items-end justify-between"}`}>
					<motion.div
						initial={{ opacity: 0, y: -8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, ease: easeOut }}
					>
						<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
							{TYPE_TAB_ITEMS.map(({ key, labelKey }) => (
								<button
									key={key}
									type="button"
									onClick={() => setTypeTab(key)}
									className={`leading-tight tracking-tight transition-all duration-300 ${
										typeTab === key
											? "bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-[26px] font-bold text-transparent"
											: "text-[17px] font-semibold text-muted-foreground/40 hover:text-muted-foreground/70"
									}`}
								>
									{t(labelKey)}
								</button>
							))}
						</div>
						<p className="mt-1 text-[12px] text-muted-foreground/60">{subtitle}</p>
					</motion.div>

					<motion.div
						initial={{ opacity: 0, y: -6 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, delay: 0.1, ease: easeOut }}
						className={`flex min-h-8 items-center gap-2 ${narrow ? "w-full" : "shrink-0"}`}
					>
						{headerTrailingSlot}
					</motion.div>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto px-8 pt-5 pb-8">
				{typeTab === "connector" ? (
					<McpSettings ref={mcpSettingsRef} />
				) : loading ? (
					<div className="flex h-full flex-col items-center justify-center gap-3 opacity-60">
						<motion.span
							className="icon-[mdi--loading] h-8 w-8 text-primary/60"
							animate={{ rotate: 360 }}
							transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
						/>
						<p className="text-[13px] text-muted-foreground/60">{t("loading")}</p>
					</div>
				) : error && !hasContent ? (
					<div className="flex h-full flex-col items-center justify-center gap-3 opacity-60">
						<span className="icon-[mdi--alert-circle-outline] h-10 w-10 text-muted-foreground/50" />
						<p className="text-[13px] text-muted-foreground/50">{error}</p>
					</div>
				) : !hasContent ? (
					<motion.div
						className="flex h-full flex-col items-center justify-center gap-5 text-center"
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, ease: easeOut }}
					>
						<motion.div
							className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-inset ring-primary/20"
							animate={{ y: [0, -6, 0] }}
							transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
						>
							<span className="absolute inset-0 rounded-3xl bg-primary/10 blur-2xl" />
							<span
								className={`relative text-4xl text-primary/80 ${
									typeTab === "scene" ? "icon-[mdi--movie-open-outline]" : "icon-[mdi--puzzle-outline]"
								}`}
							/>
						</motion.div>
						<div className="space-y-1.5">
							<p className="text-[15px] font-semibold text-foreground">
								{searchQuery ? t("empty.noMatch") : t("empty.none", { noun: typeNoun(typeTab) })}
							</p>
							<p className="text-[12px] text-muted-foreground/60">
								{searchQuery ? t("empty.noMatchHint") : t("empty.noneHint")}
							</p>
						</div>
					</motion.div>
				) : (
					<motion.div
						className="flex flex-col gap-7"
						initial="hidden"
						animate="show"
						variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
					>
						{error && (
							<div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[12px] text-muted-foreground/70">
								<span className="icon-[mdi--alert-circle-outline] h-4 w-4 shrink-0 text-muted-foreground/50" />
								<span>{t("error.partialFallback", { error, noun: typeNoun(typeTab) })}</span>
							</div>
						)}
						{agentForTab.length > 0 && (
							<SkillTagGroup
								tag={t("group.agentSkill")}
								skills={agentForTab}
								onInstall={handleInstall}
								onToggle={handleToggle}
								onUninstall={handleUninstall}
								onPreview={handlePreview}
								actionStates={actionStates}
							/>
						)}
						{customSkills.length > 0 && (
							<SkillTagGroup
								tag={t("group.custom")}
								skills={customSkills}
								onInstall={handleInstall}
								onToggle={handleToggle}
								onUninstall={handleUninstall}
								onPreview={handlePreview}
								actionStates={actionStates}
							/>
						)}
						{Array.from(groups.entries()).map(([tag, skills]) => (
							<SkillTagGroup
								key={tag}
								tag={tag === UNCATEGORIZED ? t("group.uncategorized") : tag}
								skills={skills}
								onInstall={handleInstall}
								onToggle={handleToggle}
								onUninstall={handleUninstall}
								onPreview={handlePreview}
								actionStates={actionStates}
							/>
						))}
					</motion.div>
				)}
			</div>

			<SkillDetailDialog skill={selectedSkill} onClose={() => setSelectedSkill(null)} />
		</div>
	);
}

export type ThemeUiLink_SkillTagGroupView = typeof SkillTagGroupView;
