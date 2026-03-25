import { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { SkillInfo } from "@preload/api";

interface SlashPanelProps {
	open: boolean;
	onClose: () => void;
	onSelect: (skill: SkillInfo) => void;
	filter: string;
}

const SOURCE_LABELS: Record<string, string> = {
	user: "用户",
	project: "项目",
	path: "自定义",
	scene: "场景",
};

export function SlashPanel({ open, onClose, onSelect, filter }: SlashPanelProps): JSX.Element {
	const [skills, setSkills] = useState<SkillInfo[]>([]);
	const [activeIndex, setActiveIndex] = useState(0);
	const panelRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (open) {
			void window.vetta.skills.list().then(setSkills);
		}
	}, [open]);

	// Filter skills by name
	const normalizedFilter = filter.startsWith("/") ? filter.slice(1) : filter;
	const filtered = normalizedFilter
		? skills.filter((s) => s.name.toLowerCase().includes(normalizedFilter.toLowerCase()))
		: skills;

	const scenes = filtered.filter((s) => s.type === "scene");
	const standardSkills = filtered.filter((s) => s.type !== "scene");
	const allItems = [...scenes, ...standardSkills];

	// Reset active index when filter changes
	useEffect(() => {
		setActiveIndex(0);
	}, [filter]);

	// Keyboard navigation
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (!open || allItems.length === 0) return;
			if (e.key === "ArrowDown") {
				e.preventDefault();
				e.stopPropagation();
				setActiveIndex((i) => (i + 1) % allItems.length);
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				e.stopPropagation();
				setActiveIndex((i) => (i - 1 + allItems.length) % allItems.length);
			} else if (e.key === "Enter" && allItems.length > 0) {
				e.preventDefault();
				e.stopPropagation();
				onSelect(allItems[activeIndex]);
			} else if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				onClose();
			}
		},
		[open, allItems, activeIndex, onSelect, onClose],
	);

	useEffect(() => {
		if (open) {
			document.addEventListener("keydown", handleKeyDown, true);
			return () => document.removeEventListener("keydown", handleKeyDown, true);
		}
	}, [open, handleKeyDown]);

	// Close when clicking outside
	useEffect(() => {
		if (!open) return;
		function handleClick(e: MouseEvent) {
			if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
				onClose();
			}
		}
		// Delay to avoid closing on the same click that opened it
		const timer = setTimeout(() => {
			document.addEventListener("mousedown", handleClick);
		}, 0);
		return () => {
			clearTimeout(timer);
			document.removeEventListener("mousedown", handleClick);
		};
	}, [open, onClose]);

	// Scroll active item into view
	useEffect(() => {
		if (!open) return;
		const el = panelRef.current?.querySelector(`[data-index="${activeIndex}"]`);
		el?.scrollIntoView({ block: "nearest" });
	}, [activeIndex, open]);

	return (
		<AnimatePresence>
			{open && (
				<motion.div
					ref={panelRef}
					initial={{ opacity: 0, y: 8, scaleY: 0.96 }}
					animate={{ opacity: 1, y: 0, scaleY: 1 }}
					exit={{ opacity: 0, y: 8, scaleY: 0.96 }}
					transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
					className="absolute inset-x-0 bottom-full mb-1.5 z-50 origin-bottom overflow-hidden rounded-2xl bg-card border border-border shadow-md"
					style={{
						maxHeight: 320,
					}}
				>
					{/* Header */}
					<div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
						<span className="icon-[mdi--slash-forward] h-4 w-4 text-muted-foreground/50" />
						<span className="text-[12px] font-medium text-muted-foreground/50">
							选择场景或技能
						</span>
						{normalizedFilter && (
							<span className="ml-auto text-[11px] text-muted-foreground/50">
								{allItems.length} 个结果
							</span>
						)}
					</div>

					{/* Content */}
					<div className="overflow-y-auto" style={{ maxHeight: 280 }}>
						{allItems.length === 0 ? (
							<div className="flex items-center justify-center py-8 text-[12px] text-muted-foreground/50">
								{normalizedFilter ? "未找到匹配项" : "暂无可用的技能或场景"}
							</div>
						) : (
							<div className="py-1.5">
								{/* Scenes */}
								{scenes.length > 0 && (
									<>
										<div className="px-4 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
											场景
										</div>
										{scenes.map((skill) => {
											const idx = allItems.indexOf(skill);
											return (
												<SlashItem
													key={`scene-${skill.name}`}
													skill={skill}
													active={idx === activeIndex}
													dataIndex={idx}
													onHover={() => setActiveIndex(idx)}
													onClick={() => onSelect(skill)}
												/>
											);
										})}
									</>
								)}

								{/* Skills */}
								{standardSkills.length > 0 && (
									<>
										<div className="px-4 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
											技能
										</div>
										{standardSkills.map((skill) => {
											const idx = allItems.indexOf(skill);
											return (
												<SlashItem
													key={`skill-${skill.name}`}
													skill={skill}
													active={idx === activeIndex}
													dataIndex={idx}
													onHover={() => setActiveIndex(idx)}
													onClick={() => onSelect(skill)}
												/>
											);
										})}
									</>
								)}
							</div>
						)}
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}

function SlashItem({
	skill,
	active,
	dataIndex,
	onHover,
	onClick,
}: {
	skill: SkillInfo;
	active: boolean;
	dataIndex: number;
	onHover: () => void;
	onClick: () => void;
}): JSX.Element {
	const isScene = skill.type === "scene";
	return (
		<button
			type="button"
			data-index={dataIndex}
			onMouseEnter={onHover}
			onClick={onClick}
			className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors"
			style={{
				background: active ? "var(--accent)" : "transparent",
			}}
		>
			<div
				className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${isScene ? "bg-primary/10" : "bg-muted"}`}
			>
				<span
					className={`${isScene ? "icon-[mdi--movie-open-outline]" : "icon-[mdi--puzzle-outline]"} h-3.5 w-3.5 text-muted-foreground`}
				/>
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate text-[12.5px] font-medium text-foreground">
						{skill.name}
					</span>
					<span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/50">
						{SOURCE_LABELS[skill.source] ?? skill.source}
					</span>
				</div>
				{skill.description && (
					<p className="truncate text-[11px] text-muted-foreground/50">
						{skill.description}
					</p>
				)}
			</div>
		</button>
	);
}
