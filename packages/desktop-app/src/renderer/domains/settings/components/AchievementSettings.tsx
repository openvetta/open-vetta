import { useCallback, useEffect, useRef, useState } from "react";
import type { AchievementUsageStats } from "@preload/api";
import { detectAchievementPromotion } from "../achievement-promotion-storage";
import { ACHIEVEMENTS, type Achievement } from "../achievements";
import { AchievementCarousel } from "./AchievementCarousel";
import { AchievementPromotionDialog } from "./AchievementPromotionDialog";

const EMPTY_USAGE_STATS: AchievementUsageStats = {
	automationRuns: 0,
	batchRuns: 0,
	foregroundActiveMs: 0,
	interactiveSessions: 0,
	messages: 0,
	toolsCompleted: 0,
	totalTokens: 0,
	turns: 0,
};

const PROMOTION_PREVIEW_LOOP_ENABLED = true;

export function AchievementSettings(): JSX.Element {
	const [usageStats, setUsageStats] = useState<AchievementUsageStats>(EMPTY_USAGE_STATS);
	const [usageStatsLoaded, setUsageStatsLoaded] = useState(false);
	const [promotedAchievement, setPromotedAchievement] = useState<Achievement | null>(null);
	const [promotionReplayKey, setPromotionReplayKey] = useState(0);
	const promotionCheckedRef = useRef(false);

	useEffect(() => {
		void window.vetta.appMonitor
			.getAchievementUsage()
			.then((stats) => {
				setUsageStats(stats);
				setUsageStatsLoaded(true);
			})
			.catch(() => undefined);
	}, []);

	const currentIndex = ACHIEVEMENTS.reduce(
		(highestIndex, achievement, index) =>
			usageStats.foregroundActiveMs >= achievement.targetActiveMs ? index : highestIndex,
		0,
	);

	useEffect(() => {
		if (!usageStatsLoaded || promotionCheckedRef.current) return;
		promotionCheckedRef.current = true;
		if (PROMOTION_PREVIEW_LOOP_ENABLED) {
			setPromotedAchievement(ACHIEVEMENTS[currentIndex] ?? null);
			return;
		}
		const promotedId = detectAchievementPromotion(ACHIEVEMENTS, currentIndex);
		if (!promotedId) return;
		setPromotedAchievement(
			ACHIEVEMENTS.find((achievement) => achievement.id === promotedId) ?? null,
		);
	}, [currentIndex, usageStatsLoaded]);

	const handlePromotionComplete = useCallback(() => {
		if (PROMOTION_PREVIEW_LOOP_ENABLED) {
			setPromotionReplayKey((key) => key + 1);
			return;
		}
		setPromotedAchievement(null);
	}, []);

	return (
		<>
			<div className="mx-auto w-full max-w-[920px] px-8 pb-28 pt-4">
				<AchievementCarousel
					achievements={ACHIEVEMENTS}
					currentIndex={currentIndex}
					focusSizeEnabled={usageStatsLoaded}
					usageStats={usageStats}
				/>
			</div>
			{promotedAchievement && (
				<AchievementPromotionDialog
					key={promotionReplayKey}
					achievement={promotedAchievement}
					onComplete={handlePromotionComplete}
				/>
			)}
		</>
	);
}
