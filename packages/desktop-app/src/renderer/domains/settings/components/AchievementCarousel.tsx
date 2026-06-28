import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CornerImageFrame } from "@shared/components/CornerImageFrame";
import { Button } from "@shared/components/ui/button";
import { cn } from "@shared/lib/utils";
import type { Achievement } from "../achievements";

interface DragState {
	pointerId: number;
	startX: number;
	startScrollLeft: number;
	moved: boolean;
}

interface AchievementCarouselProps {
	achievements: readonly Achievement[];
	currentIndex: number;
}

const SNAP_DELAY_MS = 140;
const MIN_SNAP_DURATION_MS = 420;
const MAX_SNAP_DURATION_MS = 650;
const NAVIGATION_DURATION_MS = 240;

type ScrollMode = "instant" | "snap" | "navigation";

function easeInOutCubic(progress: number): number {
	return progress < 0.5
		? 4 * progress * progress * progress
		: 1 - ((-2 * progress + 2) ** 3) / 2;
}

function easeOutCubic(progress: number): number {
	return 1 - (1 - progress) ** 3;
}

export function AchievementCarousel({
	achievements,
	currentIndex,
}: AchievementCarouselProps): JSX.Element {
	const { t } = useTranslation("settings");
	const trackRef = useRef<HTMLDivElement>(null);
	const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
	const dragRef = useRef<DragState | null>(null);
	const suppressClickRef = useRef(false);
	const animationFrameRef = useRef<number | null>(null);
	const snapTimeoutRef = useRef<number | null>(null);
	const targetIndexRef = useRef(currentIndex);
	const [focusedIndex, setFocusedIndex] = useState(currentIndex);
	const [dragging, setDragging] = useState(false);

	const stopScrolling = useCallback(() => {
		if (animationFrameRef.current !== null) {
			cancelAnimationFrame(animationFrameRef.current);
			animationFrameRef.current = null;
		}
		if (snapTimeoutRef.current !== null) {
			window.clearTimeout(snapTimeoutRef.current);
			snapTimeoutRef.current = null;
		}
	}, []);

	const focusAchievement = useCallback((index: number, mode: ScrollMode = "snap") => {
		const track = trackRef.current;
		const item = itemRefs.current[index];
		if (!track || !item) return;
		stopScrolling();
		targetIndexRef.current = index;
		const targetLeft = item.offsetLeft + item.offsetWidth / 2 - track.clientWidth / 2;
		if (mode === "instant") {
			track.scrollLeft = targetLeft;
			setFocusedIndex(index);
			return;
		}

		const startLeft = track.scrollLeft;
		const distance = targetLeft - startLeft;
		const duration = mode === "navigation"
			? NAVIGATION_DURATION_MS
			: Math.min(
				MAX_SNAP_DURATION_MS,
				MIN_SNAP_DURATION_MS + Math.abs(distance) * 0.35,
			);
		const easing = mode === "navigation" ? easeOutCubic : easeInOutCubic;
		const startTime = performance.now();

		const animateScroll = (time: number) => {
			const progress = Math.min((time - startTime) / duration, 1);
			track.scrollLeft = startLeft + distance * easing(progress);
			if (progress < 1) {
				animationFrameRef.current = requestAnimationFrame(animateScroll);
				return;
			}
			animationFrameRef.current = null;
			track.scrollLeft = targetLeft;
			setFocusedIndex(index);
		};

		animationFrameRef.current = requestAnimationFrame(animateScroll);
		setFocusedIndex(index);
	}, [stopScrolling]);

	const findNearestIndex = useCallback((): number => {
		const track = trackRef.current;
		if (!track) return focusedIndex;
		const center = track.scrollLeft + track.clientWidth / 2;
		let nearestIndex = 0;
		let nearestDistance = Number.POSITIVE_INFINITY;
		itemRefs.current.forEach((item, index) => {
			if (!item) return;
			const distance = Math.abs(item.offsetLeft + item.offsetWidth / 2 - center);
			if (distance < nearestDistance) {
				nearestDistance = distance;
				nearestIndex = index;
			}
		});
		return nearestIndex;
	}, [focusedIndex]);

	const snapToNearest = useCallback(() => {
		focusAchievement(findNearestIndex());
	}, [findNearestIndex, focusAchievement]);

	useEffect(() => {
		focusAchievement(currentIndex, "instant");
		return stopScrolling;
	}, [currentIndex, focusAchievement, stopScrolling]);

	const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		const track = trackRef.current;
		if (!track || event.button !== 0) return;
		stopScrolling();
		const nearestIndex = findNearestIndex();
		targetIndexRef.current = nearestIndex;
		setFocusedIndex(nearestIndex);
		dragRef.current = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startScrollLeft: track.scrollLeft,
			moved: false,
		};
		track.setPointerCapture(event.pointerId);
		setDragging(true);
	};

	const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		const track = trackRef.current;
		const drag = dragRef.current;
		if (!track || !drag || drag.pointerId !== event.pointerId) return;
		if (Math.abs(event.clientX - drag.startX) > 4) {
			drag.moved = true;
			suppressClickRef.current = true;
		}
		event.preventDefault();
		track.scrollLeft = drag.startScrollLeft - (event.clientX - drag.startX);
	};

	const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
		const track = trackRef.current;
		const drag = dragRef.current;
		if (!track || !drag || drag.pointerId !== event.pointerId) return;
		dragRef.current = null;
		if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
		setDragging(false);
		if (drag.moved) {
			requestAnimationFrame(snapToNearest);
			window.setTimeout(() => {
				suppressClickRef.current = false;
			}, 0);
		}
	};

	const focusedAchievement = achievements[focusedIndex] ?? achievements[currentIndex];
	const previousDisabled = focusedIndex === 0;
	const nextDisabled = focusedIndex === achievements.length - 1;

	return (
		<div>
			<p className="mb-4 text-[12px] text-muted-foreground">{t("achievement.dragHint")}</p>

			<div className="relative">
				<div
					ref={trackRef}
					className={cn(
						"no-scrollbar flex items-end gap-5 overflow-x-auto px-[calc(50%-96px)] py-4 select-none",
						dragging ? "cursor-grabbing" : "cursor-grab",
					)}
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={finishDrag}
					onPointerCancel={finishDrag}
					onScroll={() => {
						if (animationFrameRef.current !== null) return;
						const nearestIndex = findNearestIndex();
						targetIndexRef.current = nearestIndex;
						setFocusedIndex(nearestIndex);
						if (dragRef.current) return;
						if (snapTimeoutRef.current !== null) {
							window.clearTimeout(snapTimeoutRef.current);
						}
						snapTimeoutRef.current = window.setTimeout(() => {
							snapTimeoutRef.current = null;
							snapToNearest();
						}, SNAP_DELAY_MS);
					}}
					onLostPointerCapture={() => {
						dragRef.current = null;
						setDragging(false);
					}}
				>
					{achievements.map((achievement, index) => {
						const reached = index <= currentIndex;
						const current = index === currentIndex;
						const focused = index === focusedIndex;
						return (
							<div
								key={achievement.id}
								ref={(element) => {
									itemRefs.current[index] = element;
								}}
								className="flex w-48 shrink-0 flex-col items-center"
							>
								<button
									type="button"
									className={cn(
										"flex flex-col items-center rounded-xl p-2 outline-none transition-[background-color,opacity] duration-200 focus-visible:ring-1 focus-visible:ring-ring",
										focused && "bg-accent/50",
									)}
									onClick={() => {
										if (suppressClickRef.current) return;
										focusAchievement(index);
									}}
									aria-label={t(`achievement.stages.${achievement.id}.name`)}
								>
									<img
										src={achievement.imageUrl}
										alt=""
										draggable={false}
										className={cn(
											"object-contain transition-[width,height,filter,opacity] duration-300",
											current ? "h-48 w-48" : "h-36 w-36",
											reached ? "grayscale-0 opacity-100" : "grayscale opacity-55",
										)}
									/>
									<span
										className={cn(
											"mt-2 text-center text-[13px] font-medium",
											reached ? "text-foreground" : "text-muted-foreground",
										)}
									>
										{t(`achievement.stages.${achievement.id}.name`)}
									</span>
								</button>
							</div>
						);
					})}
				</div>

				<Button
					variant="outline"
					disabled={previousDisabled}
					aria-label={t("achievement.previous")}
					title={t("achievement.previous")}
					className="absolute top-1/2 left-2 z-10 h-[120px] w-[60px] rounded-xl bg-background/85 shadow-lg backdrop-blur-sm"
					style={{
						transform: "translateY(-50%)",
						pointerEvents: "auto",
						cursor: previousDisabled ? "default" : "pointer",
					}}
					onClick={() => focusAchievement(
						Math.max(0, targetIndexRef.current - 1),
						"navigation",
					)}
				>
					<span className="icon-[solar--alt-arrow-left-linear] h-6 w-6" />
				</Button>
				<Button
					variant="outline"
					disabled={nextDisabled}
					aria-label={t("achievement.next")}
					title={t("achievement.next")}
					className="absolute top-1/2 right-2 z-10 h-[120px] w-[60px] rounded-xl bg-background/85 shadow-lg backdrop-blur-sm"
					style={{
						transform: "translateY(-50%)",
						pointerEvents: "auto",
						cursor: nextDisabled ? "default" : "pointer",
					}}
					onClick={() => focusAchievement(
						Math.min(achievements.length - 1, targetIndexRef.current + 1),
						"navigation",
					)}
				>
					<span className="icon-[solar--alt-arrow-right-linear] h-6 w-6" />
				</Button>
			</div>

			<CornerImageFrame
				imageUrl={focusedAchievement.frameUrl}
				decoration={focusedAchievement.frameDecoration}
				className="mt-8 rounded-xl border border-border/50 bg-card/40"
				contentClassName="px-10 py-4"
			>
				<div className="flex items-center gap-2">
					<span className="text-[11px] font-medium text-primary">
						{t("achievement.stage", { current: focusedIndex + 1, total: achievements.length })}
					</span>
					{focusedIndex === currentIndex && (
						<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
							{t("achievement.current")}
						</span>
					)}
				</div>
				<h2 className="mt-2 text-[15px] font-semibold text-foreground">
					{t(`achievement.stages.${focusedAchievement.id}.name`)}
				</h2>
				<p className="mt-1 text-[12px] leading-5 text-muted-foreground">
					{t(`achievement.stages.${focusedAchievement.id}.meaning`)}
				</p>
			</CornerImageFrame>
		</div>
	);
}
