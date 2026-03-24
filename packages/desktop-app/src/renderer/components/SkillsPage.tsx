import { useState, useEffect } from "react";
import type { SkillInfo } from "@preload/api";
import { SegmentedControl } from "./ui/segmented-control";

type SkillsTab = "mine" | "discover";

const SOURCE_LABELS: Record<string, string> = {
	user: "用户",
	project: "项目",
	path: "自定义",
	scene: "场景",
};

function SceneCard({ skill }: { skill: SkillInfo }): JSX.Element {
	return (
		<div className="group relative flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 transition-all duration-200 hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] hover:shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
			<div className="flex items-start justify-between">
				<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-dim)]">
					<span className="icon-[mdi--movie-open-outline] h-5 w-5 text-[var(--text-2)]" />
				</div>
				<span className="rounded-full bg-[var(--accent-dim)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-3)]">
					{SOURCE_LABELS[skill.source] ?? skill.source}
				</span>
			</div>
			<div className="flex flex-col gap-1">
				<span className="truncate text-[13px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
					{skill.name}
				</span>
				<p className="line-clamp-2 text-[12px] leading-[1.5] text-[var(--text-3)]">
					{skill.description || "暂无描述"}
				</p>
			</div>
		</div>
	);
}

function SkillRow({ skill }: { skill: SkillInfo }): JSX.Element {
	return (
		<div className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-[var(--hover-strong)]">
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate text-[13px] font-medium text-[var(--text-1)]">
						/{skill.name}
					</span>
					<span className="shrink-0 rounded-full bg-[var(--accent-dim)] px-1.5 py-px text-[10px] font-medium text-[var(--text-3)]">
						{SOURCE_LABELS[skill.source] ?? skill.source}
					</span>
				</div>
				<p className="mt-0.5 line-clamp-1 text-[12px] leading-[1.5] text-[var(--text-3)]">
					{skill.description || "暂无描述"}
				</p>
			</div>
		</div>
	);
}

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

export function SkillsPage(): JSX.Element {
	const [tab, setTab] = useState<SkillsTab>("mine");
	const [skills, setSkills] = useState<SkillInfo[]>([]);

	useEffect(() => {
		void window.vetta.skills.list().then(setSkills);
	}, []);

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
											<SceneCard key={skill.name} skill={skill} />
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
											<SkillRow key={skill.name} skill={skill} />
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
					<div className="flex h-full flex-col items-center justify-center gap-3 opacity-60">
						<span className="icon-[mdi--compass-outline] h-10 w-10 text-[var(--text-3)]" />
						<p className="text-[13px] text-[var(--text-3)]">即将推出</p>
					</div>
				)}
			</div>
		</div>
	);
}
