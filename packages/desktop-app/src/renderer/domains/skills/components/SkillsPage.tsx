import { useAtomValue } from "jotai";
import { useState, useEffect, useCallback, useMemo } from "react";
import type { InstalledMarketSkill } from "@preload/api";
import type { MarketSkillInfo } from "@shared/lib/api";
import { downloadSkill, fetchMarketSkills } from "@shared/lib/api";
import { authTokenAtom } from "@shared/store/atoms";
import { SegmentedControl } from "@shared/components/ui/segmented-control";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/components/ui/popover";

type TypeTab = "skill" | "scene";
type ActionState = "idle" | "loading" | "done";

const UNCATEGORIZED = "未分类";

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
}

function mergeSkills(
	marketSkills: MarketSkillInfo[],
	manifest: Record<string, InstalledMarketSkill>,
): MergedSkill[] {
	const merged = new Map<string, MergedSkill>();

	// Start from market skills
	for (const ms of marketSkills) {
		const local = manifest[ms.name];
		const installed = local != null;
		const needsUpdate = installed && local.version !== ms.version;
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
			localVersion: local?.version,
		});
	}

	// Add locally installed skills that are not in market (e.g. market removed them)
	for (const [name, local] of Object.entries(manifest)) {
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
	// Sort within each group: enabled first
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
	actionState,
}: {
	skill: MergedSkill;
	onInstall: (name: string) => void;
	onToggle: (name: string) => void;
	onUninstall: (name: string) => void;
	actionState: ActionState;
}): JSX.Element {
	const isLoading = actionState === "loading";

	return (
		<div className="group relative flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-all duration-200 hover:border-input hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
			<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
				<span className={`h-4.5 w-4.5 text-muted-foreground ${
					skill.type === "scene"
						? "icon-[mdi--movie-open-outline]"
						: "icon-[mdi--puzzle-outline]"
				}`} />
			</div>

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate text-[13px] font-semibold text-foreground">
						{skill.alias || skill.name}
					</span>
					{skill.installed && skill.localVersion && (
						<span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-muted-foreground/50">
							v{skill.localVersion}
						</span>
					)}
				</div>
				<p className="mt-0.5 line-clamp-1 text-[12px] leading-[1.5] text-muted-foreground/50">
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
									className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/50 opacity-0 transition-all group-hover:opacity-100 hover:bg-accent hover:text-foreground"
								>
									<span className="icon-[mdi--dots-horizontal] h-4.5 w-4.5" />
								</button>
							</PopoverTrigger>
							<PopoverContent align="end" className="w-36 p-1">
								{skill.needsUpdate && (
									<button
										type="button"
										onClick={() => onInstall(skill.name)}
										disabled={isLoading}
										className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
									>
										<span className="icon-[mdi--update] h-4 w-4 text-muted-foreground" />
										更新
									</button>
								)}
								<button
									type="button"
									onClick={() => onUninstall(skill.name)}
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
					<button
						type="button"
						onClick={() => onInstall(skill.name)}
						disabled={isLoading}
						className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
					>
						{isLoading ? (
							<span className="icon-[mdi--loading] h-4 w-4 animate-spin" />
						) : (
							<span className="icon-[mdi--plus] h-4 w-4" />
						)}
					</button>
				)}
			</div>
		</div>
	);
}

// ─── Tag Group ───

function TagGroup({
	tag,
	skills,
	onInstall,
	onToggle,
	onUninstall,
	actionStates,
}: {
	tag: string;
	skills: MergedSkill[];
	onInstall: (name: string) => void;
	onToggle: (name: string) => void;
	onUninstall: (name: string) => void;
	actionStates: Record<string, ActionState>;
}): JSX.Element {
	return (
		<div>
			<div className="flex items-center gap-2 pb-3">
				<h2 className="text-[13px] font-semibold text-muted-foreground/70">
					{tag}
				</h2>
				<span className="rounded-full bg-primary/10 px-1.5 py-px text-[11px] tabular-nums text-muted-foreground/50">
					{skills.length}
				</span>
			</div>
			<div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2">
				{skills.map((skill) => (
					<SkillCard
						key={skill.name}
						skill={skill}
						onInstall={onInstall}
						onToggle={onToggle}
						onUninstall={onUninstall}
						actionState={actionStates[skill.name] ?? "idle"}
					/>
				))}
			</div>
		</div>
	);
}

// ─── Main page ───

export function SkillsPage(): JSX.Element {
	const [typeTab, setTypeTab] = useState<TypeTab>("skill");
	const [searchQuery, setSearchQuery] = useState("");
	const [marketSkills, setMarketSkills] = useState<MarketSkillInfo[]>([]);
	const [marketManifest, setMarketManifest] = useState<Record<string, InstalledMarketSkill>>({});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [actionStates, setActionStates] = useState<Record<string, ActionState>>({});

	const token = useAtomValue(authTokenAtom);

	const refresh = useCallback(() => {
		void window.vetta.skills.getMarketManifest().then(setMarketManifest);
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
		(name: string) => {
			if (!token) return;
			setActionState(name, "loading");
			void downloadSkill(token, name)
				.then((buffer) => window.vetta.skills.installFromMarket(name, buffer))
				.then(() => {
					setActionState(name, "done");
					refresh();
				})
				.catch((err: Error) => {
					setActionState(name, "idle");
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
		(name: string) => {
			setActionState(name, "loading");
			void window.vetta.skills
				.uninstall(name)
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

	const merged = useMemo(() => mergeSkills(marketSkills, marketManifest), [marketSkills, marketManifest]);

	const filtered = useMemo(() => {
		let list = merged.filter((s) => s.type === typeTab);
		if (searchQuery.trim()) {
			const q = searchQuery.trim().toLowerCase();
			list = list.filter(
				(s) =>
					s.name.toLowerCase().includes(q) ||
					s.alias.toLowerCase().includes(q) ||
					s.description.toLowerCase().includes(q) ||
					s.tags.some((t) => t.toLowerCase().includes(q)),
			);
		}
		return list;
	}, [merged, typeTab, searchQuery]);

	const groups = useMemo(() => groupByCategory(filtered), [filtered]);

	const enabledCount = useMemo(() => filtered.filter((s) => s.enabled).length, [filtered]);

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			{/* Drag region */}
			<div className="drag-region h-12 shrink-0" />

			{/* Header */}
			<div className="flex shrink-0 items-center justify-between px-8 pb-0">
				<h1 className="text-[20px] font-bold tracking-[-0.02em] text-foreground">
					{typeTab === "scene" ? "场景" : "技能"}
				</h1>

				<SegmentedControl
					items={[
						{ key: "skill" as TypeTab, label: "技能" },
						{ key: "scene" as TypeTab, label: "场景" },
					]}
					value={typeTab}
					onChange={setTypeTab}
				/>
			</div>

			{/* Subtitle + Search */}
			<div className="flex items-center gap-3 px-8 pt-2 pb-5">
				<p className="text-[13px] text-muted-foreground/50">
					管理技能库，安装并启用你需要的能力。已启用 {enabledCount} 个。
				</p>
				<div className="ml-auto flex items-center gap-2">
					<div className="relative">
						<span className="icon-[mdi--magnify] absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/40" />
						<input
							type="text"
							placeholder={`搜索${typeTab === "scene" ? "场景" : "技能"}...`}
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="h-8 w-52 rounded-lg border border-border bg-background pl-8 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:border-input focus:outline-none"
						/>
					</div>
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto px-8 pb-8">
				{loading ? (
					<div className="flex h-full flex-col items-center justify-center gap-3 opacity-60">
						<span className="icon-[mdi--loading] h-8 w-8 animate-spin text-muted-foreground/50" />
						<p className="text-[13px] text-muted-foreground/50">加载中...</p>
					</div>
				) : error ? (
					<div className="flex h-full flex-col items-center justify-center gap-3 opacity-60">
						<span className="icon-[mdi--alert-circle-outline] h-10 w-10 text-muted-foreground/50" />
						<p className="text-[13px] text-muted-foreground/50">{error}</p>
					</div>
				) : groups.size === 0 ? (
					<div className="flex h-full flex-col items-center justify-center gap-3 opacity-60">
						<span className="icon-[mdi--puzzle-outline] h-10 w-10 text-muted-foreground/50" />
						<p className="text-[13px] text-muted-foreground/50">
							{searchQuery ? "没有匹配的结果" : "暂无可用技能"}
						</p>
					</div>
				) : (
					<div className="flex flex-col gap-8">
						{Array.from(groups.entries()).map(([tag, skills]) => (
							<TagGroup
								key={tag}
								tag={tag}
								skills={skills}
								onInstall={handleInstall}
								onToggle={handleToggle}
								onUninstall={handleUninstall}
								actionStates={actionStates}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
