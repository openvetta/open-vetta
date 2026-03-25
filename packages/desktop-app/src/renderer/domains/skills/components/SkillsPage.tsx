import { useAtomValue } from "jotai";
import { useState, useEffect, useCallback } from "react";
import type { InstalledMarketSkill, SkillInfo } from "@preload/api";
import type { MarketSkillInfo } from "@shared/lib/api";
import { downloadSkill, fetchMarketSkills } from "@shared/lib/api";
import { authTokenAtom } from "@shared/store/atoms";
import { SegmentedControl } from "@shared/components/ui/segmented-control";

type SkillsTab = "mine" | "discover";

const SOURCE_LABELS: Record<string, string> = {
	user: "用户",
	project: "项目",
	path: "自定义",
	scene: "场景",
	market: "市场",
};

// ─── "我的" tab components ───

function SceneCard({
	skill,
	marketManifest,
	onUninstall,
}: {
	skill: SkillInfo;
	marketManifest: Record<string, InstalledMarketSkill>;
	onUninstall: (name: string) => void;
}): JSX.Element {
	const installed = marketManifest[skill.name];
	return (
		<div className="group relative flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 transition-all duration-200 hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] hover:shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
			<div className="flex items-start justify-between">
				<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-dim)]">
					<span className="icon-[mdi--movie-open-outline] h-5 w-5 text-[var(--text-2)]" />
				</div>
				<div className="flex items-center gap-1.5">
					{installed && (
						<span className="rounded-full bg-[var(--accent-dim)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-3)]">
							v{installed.version}
						</span>
					)}
					<span className="rounded-full bg-[var(--accent-dim)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-3)]">
						{SOURCE_LABELS[skill.source] ?? skill.source}
					</span>
				</div>
			</div>
			<div className="flex flex-col gap-1">
				<span className="truncate text-[13px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
					{skill.name}
				</span>
				<p className="line-clamp-2 text-[12px] leading-[1.5] text-[var(--text-3)]">
					{skill.description || "暂无描述"}
				</p>
			</div>
			{installed && (
				<button
					type="button"
					onClick={() => onUninstall(skill.name)}
					className="mt-1 self-start rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-3)] transition-colors hover:border-red-400 hover:text-red-500"
				>
					卸载
				</button>
			)}
		</div>
	);
}

function SkillRow({
	skill,
	marketManifest,
	onUninstall,
}: {
	skill: SkillInfo;
	marketManifest: Record<string, InstalledMarketSkill>;
	onUninstall: (name: string) => void;
}): JSX.Element {
	const installed = marketManifest[skill.name];
	return (
		<div className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-[var(--hover-strong)]">
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate text-[13px] font-medium text-[var(--text-1)]">
						/{skill.name}
					</span>
					{installed && (
						<span className="shrink-0 rounded-full bg-[var(--accent-dim)] px-1.5 py-px text-[10px] font-medium text-[var(--text-3)]">
							v{installed.version}
						</span>
					)}
					<span className="shrink-0 rounded-full bg-[var(--accent-dim)] px-1.5 py-px text-[10px] font-medium text-[var(--text-3)]">
						{SOURCE_LABELS[skill.source] ?? skill.source}
					</span>
				</div>
				<p className="mt-0.5 line-clamp-1 text-[12px] leading-[1.5] text-[var(--text-3)]">
					{skill.description || "暂无描述"}
				</p>
			</div>
			{installed && (
				<button
					type="button"
					onClick={() => onUninstall(skill.name)}
					className="shrink-0 rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-3)] transition-colors hover:border-red-400 hover:text-red-500"
				>
					卸载
				</button>
			)}
		</div>
	);
}

// ─── "发现" tab components ───

type MarketActionState = "idle" | "loading" | "done";

function MarketSceneCard({
	skill,
	installed,
	onInstall,
	onUpdate,
	onUninstall,
	actionState,
}: {
	skill: MarketSkillInfo;
	installed: InstalledMarketSkill | undefined;
	onInstall: (name: string) => void;
	onUpdate: (name: string) => void;
	onUninstall: (name: string) => void;
	actionState: MarketActionState;
}): JSX.Element {
	const needsUpdate = installed != null && installed.version !== skill.version;
	const isInstalled = installed != null && !needsUpdate;
	const isLoading = actionState === "loading";

	return (
		<div className="group relative flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 transition-all duration-200 hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] hover:shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
			<div className="flex items-start justify-between">
				<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-dim)]">
					<span className="icon-[mdi--movie-open-outline] h-5 w-5 text-[var(--text-2)]" />
				</div>
				<div className="flex items-center gap-1.5">
					<span className="rounded-full bg-[var(--accent-dim)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-3)]">
						{skill.type === "scene" ? "场景" : "技能"}
					</span>
					<span className="rounded-full bg-[var(--accent-dim)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-3)]">
						v{skill.version}
					</span>
				</div>
			</div>
			<div className="flex flex-col gap-1">
				<span className="truncate text-[13px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
					{skill.name}
				</span>
				<p className="line-clamp-2 text-[12px] leading-[1.5] text-[var(--text-3)]">
					{skill.description || "暂无描述"}
				</p>
			</div>
			<div className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
				<span>{skill.author}</span>
				{skill.tags.length > 0 && (
					<>
						<span>·</span>
						<span className="truncate">{skill.tags.join(", ")}</span>
					</>
				)}
			</div>
			<div className="mt-1 flex items-center gap-2">
				{isInstalled ? (
					<>
						<span className="rounded-lg bg-[var(--accent-dim)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-3)]">
							已安装
						</span>
						<button
							type="button"
							onClick={() => onUninstall(skill.name)}
							disabled={isLoading}
							className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-3)] transition-colors hover:border-red-400 hover:text-red-500 disabled:opacity-50"
						>
							卸载
						</button>
					</>
				) : needsUpdate ? (
					<>
						<button
							type="button"
							onClick={() => onUpdate(skill.name)}
							disabled={isLoading}
							className="rounded-lg bg-[var(--accent)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent-fg)] transition-opacity hover:bg-[var(--accent-hover)] disabled:opacity-50"
						>
							{isLoading ? "更新中..." : "更新"}
						</button>
						<button
							type="button"
							onClick={() => onUninstall(skill.name)}
							disabled={isLoading}
							className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-3)] transition-colors hover:border-red-400 hover:text-red-500 disabled:opacity-50"
						>
							卸载
						</button>
					</>
				) : (
					<button
						type="button"
						onClick={() => onInstall(skill.name)}
						disabled={isLoading}
						className="rounded-lg bg-[var(--accent)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent-fg)] transition-opacity hover:bg-[var(--accent-hover)] disabled:opacity-50"
					>
						{isLoading ? "安装中..." : "安装"}
					</button>
				)}
			</div>
		</div>
	);
}

function MarketSkillRow({
	skill,
	installed,
	onInstall,
	onUpdate,
	onUninstall,
	actionState,
}: {
	skill: MarketSkillInfo;
	installed: InstalledMarketSkill | undefined;
	onInstall: (name: string) => void;
	onUpdate: (name: string) => void;
	onUninstall: (name: string) => void;
	actionState: MarketActionState;
}): JSX.Element {
	const needsUpdate = installed != null && installed.version !== skill.version;
	const isInstalled = installed != null && !needsUpdate;
	const isLoading = actionState === "loading";

	return (
		<div className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-[var(--hover-strong)]">
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate text-[13px] font-medium text-[var(--text-1)]">
						/{skill.name}
					</span>
					<span className="shrink-0 rounded-full bg-[var(--accent-dim)] px-1.5 py-px text-[10px] font-medium text-[var(--text-3)]">
						{skill.type === "scene" ? "场景" : "技能"}
					</span>
					<span className="shrink-0 rounded-full bg-[var(--accent-dim)] px-1.5 py-px text-[10px] font-medium text-[var(--text-3)]">
						v{skill.version}
					</span>
				</div>
				<p className="mt-0.5 line-clamp-1 text-[12px] leading-[1.5] text-[var(--text-3)]">
					{skill.description || "暂无描述"}
				</p>
				<div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
					<span>{skill.author}</span>
					{skill.tags.length > 0 && (
						<>
							<span>·</span>
							<span className="truncate">{skill.tags.join(", ")}</span>
						</>
					)}
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				{isInstalled ? (
					<>
						<span className="rounded-lg bg-[var(--accent-dim)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-3)]">
							已安装
						</span>
						<button
							type="button"
							onClick={() => onUninstall(skill.name)}
							disabled={isLoading}
							className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-3)] transition-colors hover:border-red-400 hover:text-red-500 disabled:opacity-50"
						>
							卸载
						</button>
					</>
				) : needsUpdate ? (
					<>
						<button
							type="button"
							onClick={() => onUpdate(skill.name)}
							disabled={isLoading}
							className="rounded-lg bg-[var(--accent)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent-fg)] transition-opacity hover:bg-[var(--accent-hover)] disabled:opacity-50"
						>
							{isLoading ? "更新中..." : "更新"}
						</button>
						<button
							type="button"
							onClick={() => onUninstall(skill.name)}
							disabled={isLoading}
							className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-3)] transition-colors hover:border-red-400 hover:text-red-500 disabled:opacity-50"
						>
							卸载
						</button>
					</>
				) : (
					<button
						type="button"
						onClick={() => onInstall(skill.name)}
						disabled={isLoading}
						className="rounded-lg bg-[var(--accent)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent-fg)] transition-opacity hover:bg-[var(--accent-hover)] disabled:opacity-50"
					>
						{isLoading ? "安装中..." : "安装"}
					</button>
				)}
			</div>
		</div>
	);
}

// ─── Shared components ───

function SectionHeader({ title, count }: { title: string; count: number }): JSX.Element {
	return (
		<div className="flex items-center gap-2 pb-3">
			<h2 className="text-[13px] font-semibold uppercase tracking-[0.04em] text-[var(--text-3)]">
				{title}
			</h2>
			<span className="text-[12px] tabular-nums text-[var(--text-3)]">
				{count}
			</span>
		</div>
	);
}

// ─── Discover tab content ───

function DiscoverContent({
	marketSkills,
	marketManifest,
	loading,
	error,
	onInstall,
	onUpdate,
	onUninstall,
	actionStates,
}: {
	marketSkills: MarketSkillInfo[];
	marketManifest: Record<string, InstalledMarketSkill>;
	loading: boolean;
	error: string | null;
	onInstall: (name: string) => void;
	onUpdate: (name: string) => void;
	onUninstall: (name: string) => void;
	actionStates: Record<string, MarketActionState>;
}): JSX.Element {
	if (loading) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3 opacity-60">
				<span className="icon-[mdi--loading] h-8 w-8 animate-spin text-[var(--text-3)]" />
				<p className="text-[13px] text-[var(--text-3)]">加载中...</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3 opacity-60">
				<span className="icon-[mdi--alert-circle-outline] h-10 w-10 text-[var(--text-3)]" />
				<p className="text-[13px] text-[var(--text-3)]">{error}</p>
			</div>
		);
	}

	if (marketSkills.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3 opacity-60">
				<span className="icon-[mdi--compass-outline] h-10 w-10 text-[var(--text-3)]" />
				<p className="text-[13px] text-[var(--text-3)]">暂无可用技能</p>
			</div>
		);
	}

	const marketScenes = marketSkills.filter((s) => s.type === "scene");
	const marketStandard = marketSkills.filter((s) => s.type !== "scene");

	return (
		<div className="flex flex-col gap-8">
			{marketScenes.length > 0 && (
				<div>
					<SectionHeader title="场景" count={marketScenes.length} />
					<div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
						{marketScenes.map((skill) => (
							<MarketSceneCard
								key={skill.name}
								skill={skill}
								installed={marketManifest[skill.name]}
								onInstall={onInstall}
								onUpdate={onUpdate}
								onUninstall={onUninstall}
								actionState={actionStates[skill.name] ?? "idle"}
							/>
						))}
					</div>
				</div>
			)}
			{marketStandard.length > 0 && (
				<div>
					<SectionHeader title="技能" count={marketStandard.length} />
					<div className="flex flex-col gap-px rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1">
						{marketStandard.map((skill) => (
							<MarketSkillRow
								key={skill.name}
								skill={skill}
								installed={marketManifest[skill.name]}
								onInstall={onInstall}
								onUpdate={onUpdate}
								onUninstall={onUninstall}
								actionState={actionStates[skill.name] ?? "idle"}
							/>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

// ─── Main page ───

export function SkillsPage(): JSX.Element {
	const [tab, setTab] = useState<SkillsTab>("mine");
	const [skills, setSkills] = useState<SkillInfo[]>([]);
	const [marketManifest, setMarketManifest] = useState<Record<string, InstalledMarketSkill>>({});

	// Discover tab state
	const [marketSkills, setMarketSkills] = useState<MarketSkillInfo[]>([]);
	const [marketLoading, setMarketLoading] = useState(false);
	const [marketError, setMarketError] = useState<string | null>(null);
	const [actionStates, setActionStates] = useState<Record<string, MarketActionState>>({});

	const token = useAtomValue(authTokenAtom);

	const refreshLocal = useCallback(() => {
		void window.vetta.skills.list().then(setSkills);
		void window.vetta.skills.getMarketManifest().then(setMarketManifest);
	}, []);

	// Load local skills + manifest on mount
	useEffect(() => {
		refreshLocal();
	}, [refreshLocal]);

	// Load market skills when switching to discover tab
	useEffect(() => {
		if (tab !== "discover") return;
		if (!token) {
			setMarketError("请先登录后再浏览技能市场");
			return;
		}
		setMarketLoading(true);
		setMarketError(null);
		void fetchMarketSkills(token)
			.then((list) => {
				setMarketSkills(list);
				setMarketError(null);
			})
			.catch((err: Error) => {
				setMarketError(err.message || "加载失败");
			})
			.finally(() => {
				setMarketLoading(false);
			});
	}, [tab, token]);

	const setActionState = useCallback((name: string, state: MarketActionState) => {
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
					refreshLocal();
				})
				.catch((err: Error) => {
					setActionState(name, "idle");
					console.error("安装失败:", err.message);
				});
		},
		[token, refreshLocal, setActionState],
	);

	const handleUpdate = useCallback(
		(name: string) => {
			// Update is the same as install (overwrite)
			handleInstall(name);
		},
		[handleInstall],
	);

	const handleUninstall = useCallback(
		(name: string) => {
			setActionState(name, "loading");
			void window.vetta.skills
				.uninstall(name)
				.then(() => {
					setActionState(name, "idle");
					refreshLocal();
				})
				.catch((err: Error) => {
					setActionState(name, "idle");
					console.error("卸载失败:", err.message);
				});
		},
		[refreshLocal, setActionState],
	);

	const scenes = skills.filter((s) => s.type === "scene");
	const standardSkills = skills.filter((s) => s.type !== "scene");

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			{/* Drag region */}
			<div className="drag-region h-12 shrink-0" />
			{/* Header */}
			<div className="flex shrink-0 items-center justify-between px-8 pb-0">
				<h1 className="text-[20px] font-bold tracking-[-0.02em] text-[var(--text-1)]">
					技能广场
				</h1>

				<SegmentedControl
					items={[
						{ key: "mine" as SkillsTab, label: "我的" },
						{ key: "discover" as SkillsTab, label: "发现" },
					]}
					value={tab}
					onChange={setTab}
				/>
			</div>

			{/* Subtitle */}
			<div className="px-8 pt-1.5 pb-5">
				<p className="text-[13px] text-[var(--text-3)]">
					{tab === "mine"
						? `已安装 ${scenes.length} 个场景，${standardSkills.length} 个技能`
						: "探索社区分享的技能"}
				</p>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto px-8 pb-8">
				{tab === "mine" ? (
					scenes.length > 0 || standardSkills.length > 0 ? (
						<div className="flex flex-col gap-8">
							{/* Scenes section */}
							{scenes.length > 0 && (
								<div>
									<SectionHeader title="场景" count={scenes.length} />
									<div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
										{scenes.map((skill) => (
											<SceneCard
												key={skill.name}
												skill={skill}
												marketManifest={marketManifest}
												onUninstall={handleUninstall}
											/>
										))}
									</div>
								</div>
							)}

							{/* Skills section */}
							{standardSkills.length > 0 && (
								<div>
									<SectionHeader title="技能" count={standardSkills.length} />
									<div className="flex flex-col gap-px rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1">
										{standardSkills.map((skill) => (
											<SkillRow
												key={skill.name}
												skill={skill}
												marketManifest={marketManifest}
												onUninstall={handleUninstall}
											/>
										))}
									</div>
								</div>
							)}
						</div>
					) : (
						<div className="flex h-full flex-col items-center justify-center gap-3 opacity-60">
							<span className="icon-[mdi--puzzle-outline] h-10 w-10 text-[var(--text-3)]" />
							<p className="text-[13px] text-[var(--text-3)]">暂无已安装的技能</p>
						</div>
					)
				) : (
					<DiscoverContent
						marketSkills={marketSkills}
						marketManifest={marketManifest}
						loading={marketLoading}
						error={marketError}
						onInstall={handleInstall}
						onUpdate={handleUpdate}
						onUninstall={handleUninstall}
						actionStates={actionStates}
					/>
				)}
			</div>
		</div>
	);
}
