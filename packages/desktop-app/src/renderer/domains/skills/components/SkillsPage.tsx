import { useAtomValue, useSetAtom } from "jotai";
import { motion } from "motion/react";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { InstalledSkill, SkillInfo } from "@preload/api";
import type { MarketSkillInfo } from "@shared/lib/api";
import { downloadSkill, fetchMarketSkills } from "@shared/lib/api";
import { authTokenAtom, filePreviewAtom, pageHeaderTitleHiddenAtom } from "@shared/store/atoms";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/components/ui/popover";
import { Button } from "@shared/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/components/ui/dialog";
import { useNarrowScreen } from "@shared/hooks/useNarrowScreen";
import { PluginsPanel, type PluginsPanelHandle } from "./PluginsPanel";

type TypeTab = "skill" | "scene" | "plugin";
type ActionState = "idle" | "loading" | "done";

// 渲染期解析为 t("group.uncategorized")（模块级常量不存中文）。
const UNCATEGORIZED = "__uncategorized__";
const easeOut = [0.22, 1, 0.36, 1] as const;

interface MergedSkill {
	name: string;
	alias: string;
	description: string;
	type: "skill" | "scene";
	version: string;
	author: string;
	tags: string[];
	category: string;
	installed: boolean;
	enabled: boolean;
	needsUpdate: boolean;
	localVersion?: string;
	isCustom?: boolean;
	/** 通用 Agent Skill（~/.agents/skills）：只读展示，不可安装/卸载/启停。 */
	isAgent?: boolean;
	downloadCount: number;
	license: string;
}

function mergeSkills(
	marketSkills: MarketSkillInfo[],
	manifest: Record<string, InstalledSkill>,
): MergedSkill[] {
	const merged = new Map<string, MergedSkill>();

	for (const ms of marketSkills) {
		const local = manifest[ms.name];
		const isMarketLocal = local?.source === "market";
		const installed = isMarketLocal;
		const needsUpdate = isMarketLocal && local.version !== ms.version;
		merged.set(ms.name, {
			name: ms.name,
			alias: ms.alias,
			description: ms.description,
			type: ms.type,
			version: ms.version,
			author: ms.author,
			tags: ms.tags,
			category: ms.category,
			installed,
			enabled: installed ? local.enabled : false,
			needsUpdate,
			localVersion: isMarketLocal ? local.version : undefined,
			downloadCount: ms.download_count ?? 0,
			license: ms.license,
		});
	}

	for (const [name, local] of Object.entries(manifest)) {
		if (local.source === "custom") continue;
		if (!merged.has(name)) {
			merged.set(name, {
				name,
				alias: "",
				description: "",
				type: "skill",
				version: local.version,
				author: "",
				tags: [],
				category: "",
				installed: true,
				enabled: local.enabled,
				needsUpdate: false,
				localVersion: local.version,
				downloadCount: 0,
				license: "",
			});
		}
	}

	return Array.from(merged.values());
}

function buildCustomSkills(manifest: Record<string, InstalledSkill>): MergedSkill[] {
	const list: MergedSkill[] = [];
	for (const entry of Object.values(manifest)) {
		if (entry.source !== "custom") continue;
		list.push({
			name: entry.name,
			alias: entry.alias ?? "",
			description: entry.description,
			type: "skill",
			version: entry.version,
			author: "",
			tags: [],
			category: "",
			installed: true,
			enabled: entry.enabled,
			needsUpdate: false,
			localVersion: entry.version,
			isCustom: true,
			downloadCount: 0,
			license: "",
		});
	}
	list.sort((a, b) => {
		if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
		return a.name.localeCompare(b.name);
	});
	return list;
}

function groupByCategory(skills: MergedSkill[]): Map<string, MergedSkill[]> {
	const groups = new Map<string, MergedSkill[]>();
	for (const skill of skills) {
		const category = skill.category || UNCATEGORIZED;
		const group = groups.get(category);
		if (group) {
			group.push(skill);
		} else {
			groups.set(category, [skill]);
		}
	}
	for (const group of groups.values()) {
		group.sort((a, b) => {
			if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
			if (a.installed !== b.installed) return a.installed ? -1 : 1;
			// 同等安装态下按热度（下载量）降序，便于区分热门
			if (a.downloadCount !== b.downloadCount) return b.downloadCount - a.downloadCount;
			return a.name.localeCompare(b.name);
		});
	}
	return groups;
}

// ─── Toggle Switch ───
function ToggleSwitch({
	checked,
	onChange,
	disabled,
}: {
	checked: boolean;
	onChange: () => void;
	disabled?: boolean;
}): JSX.Element {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			disabled={disabled}
			onClick={(e) => {
				e.stopPropagation();
				onChange();
			}}
			className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
				checked ? "bg-primary" : "bg-input"
			}`}
		>
			<span
				className={`pointer-events-none block h-3.5 w-3.5 rounded-full bg-background shadow-lg ring-0 transition-transform duration-200 ${
					checked ? "translate-x-4" : "translate-x-0.5"
				}`}
			/>
		</button>
	);
}

// ─── Skill Card ───
function SkillCard({
	skill,
	onInstall,
	onToggle,
	onUninstall,
	onPreview,
	actionState,
}: {
	skill: MergedSkill;
	onInstall: (skill: MergedSkill) => void;
	onToggle: (name: string) => void;
	onUninstall: (name: string, type: "skill" | "scene") => void;
	onPreview?: (skill: MergedSkill) => void;
	actionState: ActionState;
}): JSX.Element {
	const { t } = useTranslation("skills");
	const isLoading = actionState === "loading";
	const previewable = !!onPreview;

	return (
		<motion.div
			variants={{
				hidden: { opacity: 0, y: 8 },
				show: { opacity: 1, y: 0 },
			}}
			transition={{ type: "spring", stiffness: 320, damping: 26 }}
			onClick={previewable ? () => onPreview?.(skill) : undefined}
			className={`group relative flex items-center gap-3 rounded-xl bg-muted px-3 py-2.5 transition-colors duration-200 hover:bg-accent ${
				previewable ? "cursor-pointer" : ""
			}`}
		>
			<div
				className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
					skill.installed
						? "bg-primary/10 text-primary"
						: "bg-accent/50 text-muted-foreground/70"
				}`}
			>
				<span
					className={`h-4 w-4 ${
						skill.type === "scene"
							? "icon-[mdi--movie-open-outline]"
							: "icon-[mdi--puzzle-outline]"
					}`}
				/>
			</div>

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate text-[13px] font-semibold text-foreground">
						{skill.alias || skill.name}
					</span>
					{skill.installed && skill.localVersion && (
						<span className="inline-flex h-4 shrink-0 items-center rounded-full bg-accent/50 px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground/70">
							v{skill.localVersion}
						</span>
					)}
					{!skill.isCustom && skill.downloadCount > 0 && (
						<span className="inline-flex h-4 shrink-0 items-center gap-0.5 rounded-full bg-accent/50 px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground/70">
							<span className="icon-[mdi--download] h-2.5 w-2.5" />
							{skill.downloadCount}
						</span>
					)}
					{skill.isCustom && (
						<span className="inline-flex h-4 shrink-0 items-center rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
							{t("card.custom")}
						</span>
					)}
					{skill.isAgent && (
						<span className="inline-flex h-4 shrink-0 items-center gap-0.5 rounded-full bg-accent/60 px-1.5 text-[10px] font-medium text-muted-foreground/80">
							<span className="icon-[mdi--earth] h-2.5 w-2.5" />
							{t("card.general")}
						</span>
					)}
					{skill.needsUpdate && (
						<span className="inline-flex h-4 shrink-0 items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 text-[10px] font-medium text-amber-400">
							<span className="icon-[mdi--arrow-up-bold] h-2.5 w-2.5" />
							{t("card.updatable")}
						</span>
					)}
				</div>
				<p className="mt-0.5 line-clamp-1 text-[12px] leading-[1.5] text-muted-foreground/60">
					{skill.description || t("card.noDescription")}
				</p>
			</div>

			<div className="flex shrink-0 items-center gap-1.5">
				{skill.isAgent ? (
					<span className="flex h-7 items-center gap-1 px-1.5 text-[11px] text-muted-foreground/50">
						<span className="icon-[mdi--lock-outline] h-3.5 w-3.5" />
						{t("card.readonly")}
					</span>
				) : skill.installed ? (
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
								{skill.needsUpdate && (
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											onInstall(skill);
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
										onUninstall(skill.name, skill.type);
									}}
									disabled={isLoading}
									className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
								>
									<span className="icon-[mdi--delete-outline] h-4 w-4" />
									{t("actions.uninstall")}
								</button>
							</PopoverContent>
						</Popover>
						<ToggleSwitch
							checked={skill.enabled}
							onChange={() => onToggle(skill.name)}
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
							onInstall(skill);
						}}
						disabled={isLoading}
					>
						{isLoading ? (
							<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
						) : (
							<span className="icon-[mdi--plus] h-3.5 w-3.5" />
						)}
						<span>{t("actions.install")}</span>
					</Button>
				)}
			</div>
		</motion.div>
	);
}

// ─── Scene Card (distinct visual treatment) ───
function SceneCard({
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
			{/* Body */}
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

				{/* Footer */}
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
								<ToggleSwitch
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

// ─── Tag Group ───
function TagGroup({
	tag,
	skills,
	onInstall,
	onToggle,
	onUninstall,
	onPreview,
	actionStates,
}: {
	tag: string;
	skills: MergedSkill[];
	onInstall: (skill: MergedSkill) => void;
	onToggle: (name: string) => void;
	onUninstall: (name: string, type: "skill" | "scene") => void;
	onPreview?: (skill: MergedSkill) => void;
	actionStates: Record<string, ActionState>;
}): JSX.Element {
	const { t } = useTranslation("skills");
	const enabledInGroup = skills.filter((s) => s.enabled).length;
	const isScene = skills[0]?.type === "scene";

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4, ease: easeOut }}
		>
			<div className="mb-3 flex items-baseline gap-2">
				<h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
					{tag}
				</h3>
				<span className="text-[11px] tabular-nums text-muted-foreground/40">
					{skills.length}
				</span>
				{enabledInGroup > 0 && (
					<>
						<span className="text-muted-foreground/25">·</span>
						<span className="text-[11px] text-emerald-400/80">{t("group.enabledCount", { n: enabledInGroup })}</span>
					</>
				)}
			</div>
			<motion.div
				className={
					isScene
						? "grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5"
						: "grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-x-2 gap-y-0.5"
				}
				initial="hidden"
				animate="show"
				variants={{
					hidden: {},
					show: { transition: { staggerChildren: 0.04 } },
				}}
			>
				{skills.map((skill) =>
					isScene ? (
						<SceneCard
							key={skill.name}
							scene={skill}
							onInstall={onInstall}
							onToggle={onToggle}
							onUninstall={onUninstall}
							onPreview={onPreview}
							actionState={actionStates[skill.name] ?? "idle"}
						/>
					) : (
						<SkillCard
							key={skill.name}
							skill={skill}
							onInstall={onInstall}
							onToggle={onToggle}
							onUninstall={onUninstall}
							onPreview={onPreview}
							actionState={actionStates[skill.name] ?? "idle"}
						/>
					),
				)}
			</motion.div>
		</motion.div>
	);
}

// ─── Main page ───
export function SkillsPage(): JSX.Element {
	const { t } = useTranslation("skills");
	const typeNoun = (tab: TypeTab) =>
		tab === "scene" ? t("typeNoun.scene") : tab === "skill" ? t("typeNoun.skill") : t("typeNoun.plugin");
	const [typeTab, setTypeTab] = useState<TypeTab>("scene");
	const [searchQuery, setSearchQuery] = useState("");
	const [marketSkills, setMarketSkills] = useState<MarketSkillInfo[]>([]);
	const [manifest, setManifest] = useState<Record<string, InstalledSkill>>({});
	// 通用 Agent Skill（全局 ~/.agents/skills）：只读分区数据，与市场/自定义无关。
	const [agentSkills, setAgentSkills] = useState<SkillInfo[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [actionStates, setActionStates] = useState<Record<string, ActionState>>({});
	const [importing, setImporting] = useState(false);
	const [selectedSkill, setSelectedSkill] = useState<MergedSkill | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const pluginsPanelRef = useRef<PluginsPanelHandle>(null);

	const token = useAtomValue(authTokenAtom);
	const setFilePreview = useSetAtom(filePreviewAtom);
	const setHeaderTitleHidden = useSetAtom(pageHeaderTitleHiddenAtom);
	const narrow = useNarrowScreen();

	const refresh = useCallback(() => {
		void window.vetta.skills.getMarketManifest().then(setManifest);
		// 全局通用 Agent Skill（不传 cwd → 仅 ~/.agents/skills），只读展示。
		void window.vetta.skills
			.list()
			.then((list) => setAgentSkills(list.filter((s) => s.source.startsWith("agents-"))));
	}, []);

	const loadMarket = useCallback(() => {
		if (!token) {
			// 未登录：不拉取市场数据，但仍展示本地已安装/自定义/Agent 技能。
			setMarketSkills([]);
			setError(null);
			setLoading(false);
			return;
		}
		setLoading(true);
		setError(null);
		void fetchMarketSkills(token)
			.then((list) => {
				setMarketSkills(list);
				setError(null);
			})
			.catch((err: Error) => {
				setError(err.message || t("error.loadFailed"));
			})
			.finally(() => setLoading(false));
	}, [token]);

	useEffect(() => {
		refresh();
		loadMarket();
	}, [refresh, loadMarket]);

	// 扩展页不显示顶栏左上角标题（页面内已有大号场景/技能/插件切换器）。
	useEffect(() => {
		setHeaderTitleHidden(true);
		return () => setHeaderTitleHidden(false);
	}, [setHeaderTitleHidden]);

	const setActionState = useCallback((name: string, state: ActionState) => {
		setActionStates((prev) => ({ ...prev, [name]: state }));
	}, []);

	const handleInstall = useCallback(
		(skill: MergedSkill) => {
			if (!token) return;
			setActionState(skill.name, "loading");
			void downloadSkill(token, skill.name)
				.then((buffer) =>
					window.vetta.skills.installFromMarket(skill.name, buffer, skill.type, {
						alias: skill.alias,
						marketDescription: skill.description,
						version: skill.version,
					}),
				)
				.then(() => {
					setActionState(skill.name, "done");
					refresh();
				})
				.catch((err: Error) => {
					setActionState(skill.name, "idle");
					console.error("安装失败:", err.message);
				});
		},
		[token, refresh, setActionState],
	);

	const handleToggle = useCallback(
		(name: string) => {
			void window.vetta.skills
				.toggle(name)
				.then(() => refresh())
				.catch((err: Error) => {
					console.error("切换失败:", err.message);
				});
		},
		[refresh],
	);

	const handleUninstall = useCallback(
		(name: string, type: "skill" | "scene") => {
			setActionState(name, "loading");
			void window.vetta.skills
				.uninstall(name, type)
				.then(() => {
					setActionState(name, "idle");
					refresh();
				})
				.catch((err: Error) => {
					setActionState(name, "idle");
					console.error("卸载失败:", err.message);
				});
		},
		[refresh, setActionState],
	);

	const handlePreview = useCallback(
		(skill: MergedSkill) => {
			if (skill.installed || skill.isAgent) {
				void window.vetta.skills
					.getSkillMdPath(skill.name, skill.type)
					.then((path) => {
						setFilePreview({
							name: `${skill.alias || skill.name} — SKILL.md`,
							path,
						});
					})
					.catch((err: Error) => {
						console.error("打开预览失败:", err.message);
					});
			} else {
				setSelectedSkill(skill);
			}
		},
		[setFilePreview],
	);

	const handleImportClick = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	const handleFileChange = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0];
			event.target.value = "";
			if (!file) return;
			setImporting(true);
			void file
				.arrayBuffer()
				.then((buffer) => window.vetta.skills.importCustom(buffer))
				.then(() => {
					refresh();
				})
				.catch((err: Error) => {
					alert(t("import.failed", { error: err.message || t("import.unknownError") }));
				})
				.finally(() => setImporting(false));
		},
		[refresh],
	);

	const merged = useMemo(() => mergeSkills(marketSkills, manifest), [marketSkills, manifest]);

	const filterBySearch = useCallback(
		(list: MergedSkill[]) => {
			const q = searchQuery.trim().toLowerCase();
			if (!q) return list;
			return list.filter(
				(s) =>
					s.name.toLowerCase().includes(q) ||
					s.alias.toLowerCase().includes(q) ||
					s.description.toLowerCase().includes(q) ||
					s.tags.some((t) => t.toLowerCase().includes(q)),
			);
		},
		[searchQuery],
	);

	const filtered = useMemo(
		() => filterBySearch(merged.filter((s) => s.type === typeTab)),
		[merged, typeTab, filterBySearch],
	);

	const customSkills = useMemo(
		() => (typeTab === "skill" ? filterBySearch(buildCustomSkills(manifest)) : []),
		[manifest, typeTab, filterBySearch],
	);

	const groups = useMemo(() => groupByCategory(filtered), [filtered]);

	// 通用 Agent Skill 只读分区：按当前 tab 的 type 过滤 + 搜索过滤。
	const agentForTab = useMemo<MergedSkill[]>(
		() =>
			filterBySearch(
				agentSkills
					.filter((s) => s.type === typeTab)
					.map((s) => ({
						name: s.name,
						alias: s.alias ?? "",
						description: s.description,
						type: s.type,
						version: "",
						author: "",
						tags: [],
						category: "",
						installed: true,
						enabled: true,
						needsUpdate: false,
						isAgent: true,
						downloadCount: 0,
						license: "",
					})),
			),
		[agentSkills, typeTab, filterBySearch],
	);

	const hasContent = groups.size > 0 || customSkills.length > 0 || agentForTab.length > 0;

	return (
		<div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
			<div className="drag-region h-6 shrink-0" />

			{/* Header */}
			<div className="relative shrink-0 px-8 pb-4">
				<div
					className={`flex gap-4 ${narrow ? "flex-col items-stretch" : "items-end justify-between"}`}
				>
					<motion.div
						initial={{ opacity: 0, y: -8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, ease: easeOut }}
					>
						<div className="flex items-baseline gap-3">
							{(
								[
									{ key: "scene" as TypeTab, label: t("tabs.scene") },
									{ key: "skill" as TypeTab, label: t("tabs.skill") },
									{ key: "plugin" as TypeTab, label: t("tabs.plugin") },
								] as const
							).map(({ key, label }) => (
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
									{label}
								</button>
							))}
						</div>
						<p className="mt-1 text-[12px] text-muted-foreground/60">
							{t("subtitle")}
						</p>
					</motion.div>

					<motion.div
						initial={{ opacity: 0, y: -6 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, delay: 0.1, ease: easeOut }}
						className={`flex items-center gap-2 ${narrow ? "w-full" : ""}`}
					>
						{typeTab !== "plugin" && (
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
						)}
						{typeTab === "skill" && (
							<>
								<input
									ref={fileInputRef}
									type="file"
									accept=".zip,.tar.gz,.tgz,application/zip,application/gzip,application/x-gzip"
									className="hidden"
									onChange={handleFileChange}
								/>
								<Button
									type="button"
									variant="outline"
									onClick={handleImportClick}
									disabled={importing}
								>
									{importing ? (
										<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
									) : (
										<span className="icon-[mdi--tray-arrow-up] h-3.5 w-3.5" />
									)}
									<span>{t("actions.importSkill")}</span>
								</Button>
							</>
						)}
						{typeTab === "plugin" && (
							<Button
								type="button"
								variant="outline"
								onClick={() => pluginsPanelRef.current?.triggerImport()}
							>
								<span className="icon-[mdi--tray-arrow-up] h-3.5 w-3.5" />
								<span>{t("actions.importPlugin")}</span>
							</Button>
						)}
					</motion.div>
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto px-8 pt-5 pb-8">
				{typeTab === "plugin" ? (
					<PluginsPanel ref={pluginsPanelRef} />
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
									typeTab === "scene"
										? "icon-[mdi--movie-open-outline]"
										: "icon-[mdi--puzzle-outline]"
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
							<TagGroup
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
							<TagGroup
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
							<TagGroup
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

			<SkillDetailDialog
				skill={selectedSkill}
				onClose={() => setSelectedSkill(null)}
			/>
		</div>
	);
}

function SkillDetailDialog({ skill, onClose }: { skill: MergedSkill | null; onClose: () => void }) {
	const { t } = useTranslation("skills");

	if (!skill) return null;

	const typeNoun = skill.type === "scene" ? t("typeNoun.scene") : t("typeNoun.skill");

	return (
		<Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="text-lg font-bold">
						{skill.alias || skill.name}
					</DialogTitle>
				</DialogHeader>
				<div className="mt-2 space-y-4 text-sm">
					{skill.alias && skill.alias !== skill.name && (
						<div className="rounded-lg bg-muted/50 px-3 py-2">
							<span className="text-muted-foreground">{t("detail.name")}: </span>
							<span className="font-mono text-[13px]">{skill.name}</span>
						</div>
					)}

					<div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-muted/30 px-3 py-3">
						<div>
							<span className="text-muted-foreground">{t("detail.type")}</span>
							<p className="font-medium">{typeNoun}</p>
						</div>
						{skill.version && (
							<div>
								<span className="text-muted-foreground">{t("detail.version")}</span>
								<p className="font-medium">{skill.version}</p>
							</div>
						)}
						{skill.author && (
							<div>
								<span className="text-muted-foreground">{t("detail.author")}</span>
								<p className="font-medium">{skill.author}</p>
							</div>
						)}
						{skill.downloadCount != null && (
							<div>
								<span className="text-muted-foreground">{t("detail.downloads")}</span>
								<p className="font-medium">{skill.downloadCount.toLocaleString()}</p>
							</div>
						)}
					</div>

					{skill.tags && skill.tags.length > 0 && (
						<div className="flex flex-wrap gap-1.5">
							{skill.tags.map((tag) => (
								<span
									key={tag}
									className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] text-primary/80"
								>
									{tag}
								</span>
							))}
						</div>
					)}

					{skill.description && (
						<div>
							<h4 className="mb-1.5 text-[13px] font-semibold text-foreground/70">
								{t("detail.description")}
							</h4>
							<p className="leading-relaxed text-muted-foreground whitespace-pre-line">
								{skill.description}
							</p>
						</div>
					)}

					{skill.type === "skill" && (
						<>
							{skill.license && (
								<div className="flex items-center gap-1 text-muted-foreground/60">
									<span className="icon-[mdi--scale-balance] h-3.5 w-3.5" />
									<span className="text-[12px]">{skill.license}</span>
								</div>
							)}

							<div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/20 px-3 py-2.5 text-[12px] text-muted-foreground/60">
								<p>
									{t("detail.notInstalledHint")}
								</p>
							</div>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
