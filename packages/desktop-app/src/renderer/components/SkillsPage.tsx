import { useState, useEffect } from "react";
import type { SkillInfo } from "../../preload/api";
import { SegmentedControl } from "./ui/segmented-control";

type SkillsTab = "mine" | "discover";

const SOURCE_LABELS: Record<string, string> = {
	user: "用户",
	project: "项目",
	path: "自定义",
};

function SkillCard({ skill }: { skill: SkillInfo }): JSX.Element {
	return (
		<div className="group relative flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 transition-all duration-200 hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] hover:shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
			{/* Icon */}
			<div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--accent-dim)]">
				<span className="icon-[mdi--puzzle-outline] h-5 w-5 text-[var(--text-2)]" />
			</div>

			{/* Name + source badge */}
			<div className="flex items-center gap-2">
				<span className="truncate text-[13px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
					{skill.name}
				</span>
				<span className="shrink-0 rounded-full bg-[var(--accent-dim)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-2)]">
					{SOURCE_LABELS[skill.source] ?? skill.source}
				</span>
			</div>

			{/* Description */}
			<p className="line-clamp-2 text-[12px] leading-[1.6] text-[var(--text-3)]">
				{skill.description || "暂无描述"}
			</p>
		</div>
	);
}

export function SkillsPage(): JSX.Element {
	const [tab, setTab] = useState<SkillsTab>("mine");
	const [skills, setSkills] = useState<SkillInfo[]>([]);

	useEffect(() => {
		void window.vetta.skills.list().then(setSkills);
	}, []);

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
						? `已安装 ${skills.length} 个技能`
						: "探索社区分享的技能"}
				</p>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto px-8 pb-8">
				{tab === "mine" ? (
					skills.length > 0 ? (
						<div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
							{skills.map((skill) => (
								<SkillCard key={skill.name} skill={skill} />
							))}
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
