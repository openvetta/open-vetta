import { useEffect, useState } from "react";
import type { AchievementUsageStats } from "@preload/api";
import { ACHIEVEMENTS } from "../achievements";
import { AchievementCarousel } from "./AchievementCarousel";

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

export function AchievementSettings(): JSX.Element {
	const [usageStats, setUsageStats] = useState<AchievementUsageStats>(EMPTY_USAGE_STATS);

	useEffect(() => {
		void window.vetta.appMonitor
			.getAchievementUsage()
			.then(setUsageStats)
			.catch(() => undefined);
	}, []);

	const currentIndex = ACHIEVEMENTS.reduce(
		(highestIndex, achievement, index) =>
			usageStats.foregroundActiveMs >= achievement.targetActiveMs ? index : highestIndex,
		0,
	);

	return (
		<div className="mx-auto w-full max-w-[920px] px-8 pb-28 pt-4">
			<AchievementCarousel
				achievements={ACHIEVEMENTS}
				currentIndex={currentIndex}
				usageStats={usageStats}
			/>
		</div>
	);
}
