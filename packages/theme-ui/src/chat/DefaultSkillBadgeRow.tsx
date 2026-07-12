import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { motion } from "motion/react";
import { useThemeComponent } from "@vetta/theme-sdk";
import { cn } from "@vetta/ui";
import type { NewSessionSkillBadgeRowProps } from "./NewSession";
import { SkillCard } from "./SkillCard";

/**
 * Skill pill row with horizontal scroll and edge arrows.
 * No enter animation (sits above input bar).
 */
export function DefaultSkillBadgeRow({
	className,
	labels,
	skills,
	selected,
	onSelect,
	...props
}: NewSessionSkillBadgeRowProps): JSX.Element {
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
		<div className={cn("group relative mt-4 w-full", className)} {...props}>
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

			{canPrev && (
				<>
					<div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background to-transparent" />
					<motion.button
						type="button"
						onClick={() => scrollBy(-1)}
						whileHover={{ scale: 1.08 }}
						whileTap={{ scale: 0.92 }}
						className="absolute -left-3 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 hover:border-primary/40 hover:text-primary"
						title={labels.scrollLeft}
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
						title={labels.scrollRight}
					>
						<span className="icon-[mdi--chevron-right] h-4 w-4" />
					</motion.button>
				</>
			)}
		</div>
	);
}
