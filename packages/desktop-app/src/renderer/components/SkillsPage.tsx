import { useState, useEffect } from "react";
import type { SkillInfo } from "../../preload/api";

type SkillsTab = "mine" | "discover";

export function SkillsPage(): JSX.Element {
	const [tab, setTab] = useState<SkillsTab>("mine");
	const [skills, setSkills] = useState<SkillInfo[]>([]);

	useEffect(() => {
		void window.vetta.skills.list().then(setSkills);
	}, []);

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			{/* Header */}
			<div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-6 py-4">
				<h1 className="text-lg font-semibold text-[var(--text-1)]">技能广场</h1>
				<div className="flex gap-1 rounded-lg bg-[var(--hover-subtle)] p-0.5">
					{([
						{ key: "mine" as SkillsTab, label: "我的" },
						{ key: "discover" as SkillsTab, label: "发现" },
					]).map(({ key, label }) => (
						<button
							key={key}
							type="button"
							onClick={() => setTab(key)}
							className={`rounded-md px-3 py-1 text-[13px] font-medium transition-colors ${
								tab === key
									? "bg-[var(--content-bg)] text-[var(--text-1)] shadow-sm"
									: "text-[var(--text-3)] hover:text-[var(--text-2)]"
							}`}
						>
							{label}
						</button>
					))}
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto p-6">
				{tab === "mine" ? (
					<div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
						{skills.map((skill) => (
							<div
								key={skill.name}
								className="flex flex-col gap-2 rounded-xl border border-[var(--border)] p-4 transition-colors hover:bg-[var(--hover-subtle)]"
							>
								<div className="flex items-center gap-2">
									<span className="icon-[mdi--puzzle-outline] h-4 w-4 shrink-0 text-[var(--text-3)]" />
									<span className="truncate text-[13px] font-medium text-[var(--text-1)]">
										{skill.name}
									</span>
								</div>
								<p className="line-clamp-2 text-[12px] leading-relaxed text-[var(--text-3)]">
									{skill.description}
								</p>
							</div>
						))}
						{skills.length === 0 && (
							<p className="col-span-full text-center text-[13px] text-[var(--text-3)]">
								暂无已安装的技能
							</p>
						)}
					</div>
				) : (
					<p className="text-center text-[13px] text-[var(--text-3)]">即将推出</p>
				)}
			</div>
		</div>
	);
}
