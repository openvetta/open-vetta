import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { cn } from "@shared/lib/utils";
import { useThemeComponent } from "@vetta/theme-sdk";
import type { NewSessionSceneCarouselProps, NewSessionSceneItem } from "@vetta/theme-ui";
import { SceneCard } from "./SceneCard";
import { easeOut } from "./constants";
import type { SceneActionState, SceneItem, SkillSelection } from "./types";

interface SceneCarouselProps {
	actions: Record<string, SceneActionState>;
	onSceneClick: (scene: SceneItem) => void;
	scenes: SceneItem[];
	selected: SkillSelection;
}

// 场景卡片：横向滚动单行，每屏 3 张（宽度 = (100%-2*gap)/3），超出靠滚动 + 悬浮箭头手动翻动。
// 宽度跟随外层左对齐列（max-w-2xl），不再单独居中。
export function SceneCarousel({ scenes, selected, actions, onSceneClick }: SceneCarouselProps): JSX.Element {
	const { t } = useTranslation("chat");
	const ThemedSceneCarousel = useThemeComponent("chat.newSessionSceneCarousel", DefaultSceneCarousel);
	const handleSceneClick = useCallback(
		(scene: NewSessionSceneItem) => {
			const matched = scenes.find((item) => item.name === scene.name);
			if (matched) {
				onSceneClick(matched);
			}
		},
		[onSceneClick, scenes],
	);

	return (
		<ThemedSceneCarousel
			actions={actions}
			labels={{
				installPrompt: t("newSession.sceneInstallPrompt"),
				next: t("newSession.sceneCarouselNext"),
				previous: t("newSession.sceneCarouselPrev"),
			}}
			onSceneClick={handleSceneClick}
			scenes={scenes}
			selected={selected}
		/>
	);
}

// 场景卡片：横向滚动单行，每屏 3 张（宽度 = (100%-2*gap)/3），超出靠滚动 + 悬浮箭头手动翻动。
// 宽度跟随外层左对齐列（max-w-2xl），不再单独居中。
export function DefaultSceneCarousel({
	actions,
	className,
	labels,
	onSceneClick,
	scenes,
	selected,
	...props
}: NewSessionSceneCarouselProps): JSX.Element {
	const ThemedSceneCard = useThemeComponent("chat.newSessionSceneCard", SceneCard);
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
	}, [updateEdges, scenes.length]);

	// 翻动一屏（3 张卡 + 间隙），与可视宽度对齐。
	const scrollByView = useCallback((dir: -1 | 1) => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
	}, []);

	return (
		<div className={cn("group relative mt-6 w-full", className)} {...props}>
			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.5, delay: 0.25, ease: easeOut }}
			>
			<div
				ref={scrollRef}
				onScroll={updateEdges}
				className="no-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto py-1"
			>
				{scenes.map((s) => {
					const action = actions[s.name] ?? "idle";
					return (
						<ThemedSceneCard
							key={s.name}
							action={action}
							item={s}
							selected={selected?.name === s.name && selected?.type === "scene"}
							onClick={() => onSceneClick(s)}
							title={s.state === "uninstalled" ? labels.installPrompt : s.description || s.name}
						/>
					);
				})}
			</div>

			{canPrev && (
				<>
					<div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background to-transparent" />
					<motion.button
						type="button"
						onClick={() => scrollByView(-1)}
						whileHover={{ scale: 1.08 }}
						whileTap={{ scale: 0.92 }}
						className="absolute -left-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 hover:border-primary/40 hover:text-primary"
						title={labels.previous}
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
						onClick={() => scrollByView(1)}
						whileHover={{ scale: 1.08 }}
						whileTap={{ scale: 0.92 }}
						className="absolute -right-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 hover:border-primary/40 hover:text-primary"
						title={labels.next}
					>
						<span className="icon-[mdi--chevron-right] h-4 w-4" />
					</motion.button>
				</>
			)}
			</motion.div>
		</div>
	);
}
