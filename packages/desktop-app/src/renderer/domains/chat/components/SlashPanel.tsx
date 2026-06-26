import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import type { SkillInfo } from "@preload/api";

interface SlashPanelProps {
	open: boolean;
	onClose: () => void;
	onSelect: (skill: SkillInfo) => void;
	filter: string;
	/**
	 * "top"（默认）面板从锚点上方弹出，匹配会话页 InputBar 在屏幕底部的形态。
	 * "bottom" 朝下展开，用于面板锚点位于容器顶部、上方被 overflow 裁切的场景
	 * （如 Dialog 顶部的 prompt 区）。
	 */
	placement?: "top" | "bottom";
	/** 当前会话/项目 cwd，用于列出项目级 `<cwd>/.agents/skills` 与 `<cwd>/.vetta/skills`。 */
	cwd?: string;
}

// 模块级只存 source → i18n key 的映射（无中文），文案在 SlashItem 内由 t() 解析。
const SOURCE_LABEL_KEYS = {
	user: "slashPanel.sourceLabels.user",
	project: "slashPanel.sourceLabels.project",
	path: "slashPanel.sourceLabels.path",
	scene: "slashPanel.sourceLabels.scene",
	"agents-user": "slashPanel.sourceLabels.agentsUser",
	"agents-project": "slashPanel.sourceLabels.agentsProject",
} as const;

export function SlashPanel({ open, onClose, onSelect, filter, placement = "top", cwd }: SlashPanelProps): JSX.Element {
	const { t } = useTranslation("chat");
	const [skills, setSkills] = useState<SkillInfo[]>([]);
	const [activeIndex, setActiveIndex] = useState(0);
	const panelRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (open) {
			void window.vetta.skills.list(cwd).then(setSkills);
		}
	}, [open, cwd]);

	// Filter skills by name
	const normalizedFilter = filter.startsWith("/") ? filter.slice(1) : filter;
	const filtered = normalizedFilter
		? skills.filter((s) => {
				const q = normalizedFilter.toLowerCase();
				return s.name.toLowerCase().includes(q) || (s.alias?.toLowerCase().includes(q) ?? false);
			})
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
					initial={{ opacity: 0, y: placement === "top" ? 8 : -8, scaleY: 0.96 }}
					animate={{ opacity: 1, y: 0, scaleY: 1 }}
					exit={{ opacity: 0, y: placement === "top" ? 8 : -8, scaleY: 0.96 }}
					transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
					className={`absolute inset-x-0 z-50 overflow-hidden rounded-2xl bg-card border border-border ${
						placement === "top" ? "bottom-full mb-1.5 origin-bottom" : "top-full mt-1.5 origin-top"
					}`}
					style={{
						maxHeight: 320,
					}}
				>
					{/* Header */}
					<div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
						<span className="icon-[solar--slash-circle-linear] h-4 w-4 text-muted-foreground/50" />
						<span className="text-[12px] font-medium text-muted-foreground/50">
							{t("slashPanel.header")}
						</span>
						{normalizedFilter && (
							<span className="ml-auto text-[11px] text-muted-foreground/50">
								{t("slashPanel.resultCount", { count: allItems.length })}
							</span>
						)}
					</div>

					{/* Content */}
					<div className="overflow-y-auto" style={{ maxHeight: 280 }}>
						{allItems.length === 0 ? (
							<div className="flex items-center justify-center py-8 text-[12px] text-muted-foreground/50">
								{normalizedFilter ? t("slashPanel.emptyNoMatch") : t("slashPanel.emptyNoSkills")}
							</div>
						) : (
							<div className="py-1.5">
								{/* Scenes */}
								{scenes.length > 0 && (
									<>
										<div className="px-4 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
											{t("slashPanel.scenesSection")}
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
											{t("slashPanel.skillsSection")}
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
	const { t } = useTranslation("chat");
	const isScene = skill.type === "scene";
	const sourceKey = SOURCE_LABEL_KEYS[skill.source as keyof typeof SOURCE_LABEL_KEYS];
	return (
		<button
			type="button"
			data-index={dataIndex}
			onMouseEnter={onHover}
			onClick={onClick}
			className="relative flex w-full items-center gap-3 px-4 py-2 text-left transition-colors"
			style={{
				background: active ? "color-mix(in srgb, var(--primary) 9%, transparent)" : "transparent",
			}}
		>
			{active && (
				<motion.span
					layoutId="slash-active-marker"
					className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary"
					transition={{ type: "spring", stiffness: 500, damping: 32 }}
				/>
			)}
			<div
				className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${isScene ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}
			>
				<span
					className={`${isScene ? "icon-[solar--clapperboard-open-linear]" : "icon-[solar--magic-stick-linear]"} h-3.5 w-3.5`}
				/>
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate text-[12.5px] font-medium text-foreground">
						{skill.alias || skill.name}
					</span>
					<span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/50">
						{sourceKey ? t(sourceKey) : skill.source}
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
