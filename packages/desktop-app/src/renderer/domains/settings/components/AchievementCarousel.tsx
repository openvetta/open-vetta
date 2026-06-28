import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@shared/components/ui/button";
import { cn } from "@shared/lib/utils";
import type { Achievement } from "../achievements";

interface DragState {
	pointerId: number;
	startX: number;
	startScrollLeft: number;
}

interface AchievementCarouselProps {
	achievements: readonly Achievement[];
	currentIndex: number;
}

export function AchievementCarousel({
	achievements,
	currentIndex,
}: AchievementCarouselProps): JSX.Element {
	const { t } = useTranslation("settings");
	const trackRef = useRef<HTMLDivElement>(null);
	const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
	const dragRef = useRef<DragState | null>(null);
	const [focusedIndex, setFocusedIndex] = useState(currentIndex);
	const [dragging, setDragging] = useState(false);

	const focusAchievement = useCallback((index: number, behavior: ScrollBehavior = "smooth") => {
		const item = itemRefs.current[index];
		if (!item) return;
		item.scrollIntoView({ behavior, block: "nearest", inline: "center" });
		setFocusedIndex(index);
	}, []);

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
	}, [currentIndex, focusAchievement]);

	const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		const track = trackRef.current;
		if (!track || event.button !== 0) return;
		dragRef.current = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startScrollLeft: track.scrollLeft,
		};
		track.setPointerCapture(event.pointerId);
		setDragging(true);
	};

	const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		const track = trackRef.current;
		const drag = dragRef.current;
		if (!track || !drag || drag.pointerId !== event.pointerId) return;
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
		snapToNearest();
	};

	const focusedAchievement = achievements[focusedIndex] ?? achievements[currentIndex];

	return (
		<div>
			<div className="mb-4 flex items-center justify-between gap-3">
				<p className="text-[12px] text-muted-foreground">{t("achievement.dragHint")}</p>
				<div className="flex shrink-0 gap-2">
					<Button
						variant="outline"
						size="icon-sm"
						disabled={focusedIndex === 0}
						aria-label={t("achievement.previous")}
						title={t("achievement.previous")}
						onClick={() => focusAchievement(Math.max(0, focusedIndex - 1))}
					>
						<span className="icon-[solar--alt-arrow-left-linear] h-4 w-4" />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						disabled={focusedIndex === achievements.length - 1}
						aria-label={t("achievement.next")}
						title={t("achievement.next")}
						onClick={() => focusAchievement(Math.min(achievements.length - 1, focusedIndex + 1))}
					>
						<span className="icon-[solar--alt-arrow-right-linear] h-4 w-4" />
					</Button>
				</div>
			</div>

			<div
				ref={trackRef}
				className={cn(
					"flex snap-x snap-mandatory items-end gap-5 overflow-x-auto px-[calc(50%-96px)] py-4 select-none",
					dragging ? "cursor-grabbing scroll-auto" : "cursor-grab scroll-smooth",
				)}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={finishDrag}
				onPointerCancel={finishDrag}
				onScroll={() => setFocusedIndex(findNearestIndex())}
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
							className="flex w-48 shrink-0 snap-center flex-col items-center"
						>
							<button
								type="button"
								className={cn(
									"flex flex-col items-center rounded-xl p-2 outline-none transition-[background-color,opacity] duration-200 focus-visible:ring-1 focus-visible:ring-ring",
									focused && "bg-accent/50",
								)}
								onClick={() => focusAchievement(index)}
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
								<span className={cn(
									"mt-2 text-center text-[13px] font-medium",
									reached ? "text-foreground" : "text-muted-foreground",
								)}>
									{t(`achievement.stages.${achievement.id}.name`)}
								</span>
							</button>
						</div>
					);
				})}
			</div>

			<div className="mt-5 rounded-xl border border-border/50 bg-card/40 p-4">
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
			</div>
		</div>
	);
}
