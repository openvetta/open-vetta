import { useAtomValue, useSetAtom } from "jotai";
import { motion } from "motion/react";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { InstalledSkill } from "@preload/api";
import type { MarketSkillInfo } from "@shared/lib/api";
import { downloadSkill, fetchMarketSkills } from "@shared/lib/api";
import { authTokenAtom, filePreviewAtom } from "@shared/store/atoms";
import { SegmentedControl } from "@shared/components/ui/segmented-control";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/components/ui/popover";

type TypeTab = "skill" | "scene";
type ActionState = "idle" | "loading" | "done";

const UNCATEGORIZED = "未分类";
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
	const isLoading = actionState === "loading";
	const previewable = !!onPreview && skill.installed;

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
					{skill.isCustom && (
						<span className="inline-flex h-4 shrink-0 items-center rounded-full bg-violet-500/15 px-1.5 text-[10px] font-medium text-violet-400">
							自定义
						</span>
					)}
					{skill.needsUpdate && (
						<span className="inline-flex h-4 shrink-0 items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 text-[10px] font-medium text-amber-400">
							<span className="icon-[mdi--arrow-up-bold] h-2.5 w-2.5" />
							可更新
						</span>
					)}
				</div>
				<p className="mt-0.5 line-clamp-1 text-[12px] leading-[1.5] text-muted-foreground/60">
					{skill.description || "暂无描述"}
				</p>
			</div>

			<div className="flex shrink-0 items-center gap-1.5">
				{skill.installed ? (
					<>
						<Popover>
							<PopoverTrigger asChild>
								<button
									type="button"
									onClick={(e) => e.stopPropagation()}
									className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-all group-hover:opacity-100 hover:bg-primary/10 hover:text-primary"
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
										更新
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
									卸载
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
					<motion.button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onInstall(skill);
						}}
						disabled={isLoading}
						whileHover={!isLoading ? { scale: 1.04 } : undefined}
						whileTap={!isLoading ? { scale: 0.94 } : undefined}
						transition={{ type: "spring", stiffness: 380, damping: 22 }}
						className="flex h-7 items-center gap-1 rounded-full bg-primary/10 px-2.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
					>
						{isLoading ? (
							<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
						) : (
							<span className="icon-[mdi--plus] h-3.5 w-3.5" />
						)}
						<span>安装</span>
					</motion.button>
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
	const isLoading = actionState === "loading";
	const previewable = !!onPreview && scene.installed;

	return (
		<motion.div
			variants={{
				hidden: { opacity: 0, y: 12, scale: 0.97 },
				show: { opacity: 1, y: 0, scale: 1 },
			}}
			transition={{ type: "spring", stiffness: 280, damping: 26 }}
			whileHover={{ y: -3 }}
			onClick={previewable ? () => onPreview?.(scene) : undefined}
			className={`group relative flex flex-col overflow-hidden rounded-2xl bg-muted ring-1 ring-inset ring-transparent transition-[box-shadow,background-color] duration-200 hover:ring-primary/40 ${
				previewable ? "cursor-pointer" : ""
			}`}
		>
			{/* Decorative hero strip — solid primary in light, black + primary/40 overlay in dark */}
			<div className="relative h-16 overflow-hidden bg-primary/60 dark:bg-black">
				{/* Dark-mode primary overlay (40%) */}
				<div
					aria-hidden
					className="pointer-events-none absolute inset-0 hidden dark:block"
					style={{
						background: "color-mix(in srgb, var(--primary) 40%, transparent)",
					}}
				/>
				{/* Grid texture overlay (dark mode: white lines) */}
				<div
					aria-hidden
					className="pointer-events-none absolute inset-0 hidden dark:block"
					style={{
						backgroundImage:
							"linear-gradient(to right, rgba(255,255,255,0.09) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.09) 1px, transparent 1px)",
						backgroundSize: "10px 10px",
						maskImage:
							"radial-gradient(ellipse 90% 100% at 50% 50%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 70%, transparent 100%)",
						WebkitMaskImage:
							"radial-gradient(ellipse 90% 100% at 50% 50%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 70%, transparent 100%)",
					}}
				/>
				{/* Grid texture overlay (light mode: stronger white lines on primary wash) */}
				<div
					aria-hidden
					className="pointer-events-none absolute inset-0 block dark:hidden"
					style={{
						backgroundImage:
							"linear-gradient(to right, rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.35) 1px, transparent 1px)",
						backgroundSize: "10px 10px",
						maskImage:
							"radial-gradient(ellipse 90% 100% at 50% 50%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 70%, transparent 100%)",
						WebkitMaskImage:
							"radial-gradient(ellipse 90% 100% at 50% 50%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 70%, transparent 100%)",
					}}
				/>
				{/* Scene icon — top-right */}
				<motion.span
					aria-hidden
					className="icon-[mdi--movie-open-outline] absolute right-3 top-3 h-10 w-10 text-white/70"
					initial={{ scale: 0.9, rotate: -8 }}
					whileHover={{ scale: 1.05, rotate: -4 }}
					transition={{ type: "spring", stiffness: 300, damping: 20 }}
				/>
			</div>

			{/* Body */}
			<div className="flex flex-1 flex-col gap-2 px-4 pt-3 pb-3">
				<div className="flex items-baseline gap-2">
					<h4 className="truncate text-[14px] font-semibold tracking-tight text-foreground">
						{scene.alias || scene.name}
					</h4>
					{scene.installed && scene.localVersion && (
						<span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/45">
							v{scene.localVersion}
						</span>
					)}
				</div>
				<p className="line-clamp-2 text-[12px] leading-[1.55] text-muted-foreground/70">
					{scene.description || "暂无描述"}
				</p>

				{/* Footer */}
				<div className="mt-auto flex items-center gap-2 pt-2">
					<div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
						{scene.installed && (
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
								{scene.enabled ? "运行中" : "已安装"}
							</span>
						)}
						{scene.needsUpdate && (
							<span className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-400">
								<span className="icon-[mdi--arrow-up-bold] h-2.5 w-2.5" />
								可更新
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
						{scene.installed ? (
							<>
								<Popover>
									<PopoverTrigger asChild>
										<button
											type="button"
											onClick={(e) => e.stopPropagation()}
											className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-all group-hover:opacity-100 hover:bg-primary/10 hover:text-primary"
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
												更新
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
											卸载
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
							<motion.button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									onInstall(scene);
								}}
								disabled={isLoading}
								whileHover={!isLoading ? { scale: 1.04 } : undefined}
								whileTap={!isLoading ? { scale: 0.94 } : undefined}
								transition={{ type: "spring", stiffness: 380, damping: 22 }}
								className="flex h-7 items-center gap-1 rounded-full bg-primary px-3 text-[11px] font-medium text-primary-foreground shadow-[0_4px_14px_-4px_var(--primary)] transition-shadow hover:shadow-[0_6px_18px_-4px_var(--primary)] disabled:opacity-50"
							>
								{isLoading ? (
									<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
								) : (
									<span className="icon-[mdi--play] h-3.5 w-3.5" />
								)}
								<span>使用</span>
							</motion.button>
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
	const enabledInGroup = skills.filter((s) => s.enabled).length;
	const isScene = skills[0]?.type === "scene";

	return (
		<motion.div
			variants={{
				hidden: { opacity: 0, y: 8 },
				show: { opacity: 1, y: 0 },
			}}
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
						<span className="text-[11px] text-emerald-400/80">{enabledInGroup} 已启用</span>
					</>
				)}
			</div>
			<motion.div
				className={
					isScene
						? "grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3"
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

// ─── Stats card ───
function StatCard({
	icon,
	label,
	value,
	tint,
}: {
	icon: string;
	label: string;
	value: number;
	tint: "primary" | "emerald" | "amber";
}): JSX.Element {
	const tintClasses = {
		primary: { iconBg: "bg-primary/10 ring-primary/20", iconColor: "text-primary" },
		emerald: { iconBg: "bg-emerald-500/10 ring-emerald-500/20", iconColor: "text-emerald-400" },
		amber: { iconBg: "bg-amber-500/10 ring-amber-500/20", iconColor: "text-amber-400" },
	}[tint];
	return (
		<motion.div
			variants={{
				hidden: { opacity: 0, y: 10, scale: 0.95 },
				show: { opacity: 1, y: 0, scale: 1 },
			}}
			transition={{ type: "spring", stiffness: 320, damping: 26 }}
			whileHover={{ y: -2 }}
			className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border/40 bg-card/30 px-3.5 py-3 backdrop-blur-sm transition-colors duration-200 hover:border-primary/30"
		>
			<div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${tintClasses.iconBg}`}>
				<span className={`${icon} h-4 w-4 ${tintClasses.iconColor}`} />
			</div>
			<div className="min-w-0 flex-1">
				<p className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
					{label}
				</p>
				<p className="mt-0.5 text-[20px] font-semibold leading-none tracking-tight text-foreground">
					{value}
				</p>
			</div>
		</motion.div>
	);
}

// ─── Main page ───
export function SkillsPage(): JSX.Element {
	const [typeTab, setTypeTab] = useState<TypeTab>("scene");
	const [searchQuery, setSearchQuery] = useState("");
	const [marketSkills, setMarketSkills] = useState<MarketSkillInfo[]>([]);
	const [manifest, setManifest] = useState<Record<string, InstalledSkill>>({});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [actionStates, setActionStates] = useState<Record<string, ActionState>>({});
	const [importing, setImporting] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const token = useAtomValue(authTokenAtom);
	const setFilePreview = useSetAtom(filePreviewAtom);

	const refresh = useCallback(() => {
		void window.vetta.skills.getMarketManifest().then(setManifest);
	}, []);

	const loadMarket = useCallback(() => {
		if (!token) {
			setError("请先登录后再浏览技能市场");
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
				setError(err.message || "加载失败");
			})
			.finally(() => setLoading(false));
	}, [token]);

	useEffect(() => {
		refresh();
		loadMarket();
	}, [refresh, loadMarket]);

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
					alert(`导入失败：${err.message || "未知错误"}`);
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

	const stats = useMemo(() => {
		const all = [...filtered, ...customSkills];
		const total = all.length;
		const installed = all.filter((s) => s.installed).length;
		const enabled = all.filter((s) => s.enabled).length;
		const updates = all.filter((s) => s.needsUpdate).length;
		return { total, installed, enabled, updates };
	}, [filtered, customSkills]);

	return (
		<div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
			<div className="drag-region h-12 shrink-0" />

			{/* Header */}
			<div className="relative shrink-0 px-8 pb-4">
				<div className="flex items-end justify-between gap-4">
					<motion.div
						initial={{ opacity: 0, y: -8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, ease: easeOut }}
					>
						<div className="mb-1 flex items-center gap-2">
							<span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
								<span className="relative flex h-1.5 w-1.5">
									<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
									<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
								</span>
								{typeTab === "scene" ? "Scenes" : "Skills"}
							</span>
						</div>
						<h1 className="bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-[26px] font-bold leading-tight tracking-tight text-transparent">
							{typeTab === "scene" ? "场景广场" : "技能广场"}
						</h1>
						<p className="mt-1 text-[12px] text-muted-foreground/60">
							安装并启用你需要的能力，让 Vetta 拥有更多专业技能
						</p>
					</motion.div>

					<motion.div
						initial={{ opacity: 0, y: -6 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, delay: 0.1, ease: easeOut }}
						className="flex items-center gap-2"
					>
						<div className="relative">
							<span className="icon-[mdi--magnify] absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
							<input
								type="text"
								placeholder={`搜索${typeTab === "scene" ? "场景" : "技能"}...`}
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="h-8 w-56 rounded-full border border-border/60 bg-card/40 pl-8 pr-3 text-[12px] text-foreground placeholder:text-muted-foreground/40 transition-colors focus:border-primary/40 focus:outline-none"
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
								<motion.button
									type="button"
									onClick={handleImportClick}
									disabled={importing}
									whileHover={!importing ? { scale: 1.03 } : undefined}
									whileTap={!importing ? { scale: 0.96 } : undefined}
									transition={{ type: "spring", stiffness: 380, damping: 22 }}
									className="flex h-8 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 text-[12px] font-medium text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
								>
									{importing ? (
										<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
									) : (
										<span className="icon-[mdi--tray-arrow-up] h-3.5 w-3.5" />
									)}
									<span>导入技能</span>
								</motion.button>
							</>
						)}
						<SegmentedControl
							items={[
								{ key: "scene" as TypeTab, label: "场景" },
								{ key: "skill" as TypeTab, label: "技能" },
							]}
							value={typeTab}
							onChange={setTypeTab}
						/>
					</motion.div>
				</div>

				{/* Stats strip */}
				{stats.total > 0 && (
					<motion.div
						className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"
						initial="hidden"
						animate="show"
						variants={{
							hidden: {},
							show: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } },
						}}
					>
						<StatCard
							icon="icon-[mdi--puzzle-outline]"
							label="可用总数"
							value={stats.total}
							tint="primary"
						/>
						<StatCard
							icon="icon-[mdi--download-outline]"
							label="已安装"
							value={stats.installed}
							tint="primary"
						/>
						<StatCard
							icon="icon-[mdi--check-circle-outline]"
							label="已启用"
							value={stats.enabled}
							tint="emerald"
						/>
						<StatCard
							icon="icon-[mdi--arrow-up-bold-circle-outline]"
							label="可更新"
							value={stats.updates}
							tint="amber"
						/>
					</motion.div>
				)}
			</div>

			<div className="mx-8 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />

			{/* Content */}
			<div className="flex-1 overflow-y-auto px-8 pt-5 pb-8">
				{loading ? (
					<div className="flex h-full flex-col items-center justify-center gap-3 opacity-60">
						<motion.span
							className="icon-[mdi--loading] h-8 w-8 text-primary/60"
							animate={{ rotate: 360 }}
							transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
						/>
						<p className="text-[13px] text-muted-foreground/60">加载中...</p>
					</div>
				) : error ? (
					<div className="flex h-full flex-col items-center justify-center gap-3 opacity-60">
						<span className="icon-[mdi--alert-circle-outline] h-10 w-10 text-muted-foreground/50" />
						<p className="text-[13px] text-muted-foreground/50">{error}</p>
					</div>
				) : groups.size === 0 && customSkills.length === 0 ? (
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
								{searchQuery ? "没有匹配的结果" : `暂无可用${typeTab === "scene" ? "场景" : "技能"}`}
							</p>
							<p className="text-[12px] text-muted-foreground/60">
								{searchQuery ? "试试换个关键词" : "稍后再来看看吧"}
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
						{customSkills.length > 0 && (
							<TagGroup
								tag="自定义"
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
								tag={tag}
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
		</div>
	);
}
