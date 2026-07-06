import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { SkillInfo } from "@preload/api";
import { useThemeComponent } from "@vetta/theme-sdk";
import { SkillCard } from "./SkillCard";
import type { SkillSelection } from "./types";

interface SkillBadgeRowProps {
	onSelect: (skill: SkillInfo) => void;
	selected: SkillSelection;
	skills: SkillInfo[];
}

// 技能胶囊单行展示：横向滚动，超出时两端浮出箭头手动翻动（每次滚动约 80% 视宽）。
// 不加入场动画：该行固定在输入框上方，逐个弹入会干扰输入体验。
export function SkillBadgeRow({ skills, selected, onSelect }: SkillBadgeRowProps): JSX.Element {
	const { t } = useTranslation("chat");
	const ThemedSkillCard = useThemeComponent("chat.newSessionSkillCard", SkillCard);
	const scrollRef = useRef<HTMLDivElement>(null);
	const [canPrev, setCanPrev] = useState(false);
	const [canNext, setCanNext] = useState(false);

	const updateEdges = useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;
		setCanPrev(el.scrollLeft > 1);
		setCanNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
	}, []);

	useEffect(() => {
		updateEdges();
		const el = scrollRef.current;
		if (!el) return;
		const ro = new ResizeObserver(updateEdges);
		ro.observe(el);
		return () => ro.disconnect();
	}, [updateEdges, skills.length]);

	const scrollBy = useCallback((dir: -1 | 1) => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
	}, []);

	return (
		<div className="group relative mt-4 w-full">
			<div
				ref={scrollRef}
				onScroll={updateEdges}
				className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-1 py-1"
			>
				{skills.map((s) => {
					const active = selected?.name === s.name && selected?.type === "skill";
					return (
						<ThemedSkillCard
							key={s.name}
							active={active}
							item={s}
							onClick={() => onSelect(s)}
							title={s.description || s.name}
						/>
					);
				})}
			</div>

			{/* 两端渐隐 + 浮出箭头，提示可横向翻动 */}
			{canPrev && (
				<>
					<div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background to-transparent" />
					<motion.button
						type="button"
						onClick={() => scrollBy(-1)}
						whileHover={{ scale: 1.08 }}
						whileTap={{ scale: 0.92 }}
						className="absolute -left-3 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 hover:border-primary/40 hover:text-primary"
						title={t("newSession.skillScrollLeft")}
					>
						<span className="icon-[mdi--chevron-left] h-4 w-4" />
					</motion.button>
				</>
			)}
			{canNext && (
				<>
					<div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
					<motion.button
						type="button"
						onClick={() => scrollBy(1)}
						whileHover={{ scale: 1.08 }}
						whileTap={{ scale: 0.92 }}
						className="absolute -right-3 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 hover:border-primary/40 hover:text-primary"
						title={t("newSession.skillScrollRight")}
					>
						<span className="icon-[mdi--chevron-right] h-4 w-4" />
					</motion.button>
				</>
			)}
		</div>
	);
}
