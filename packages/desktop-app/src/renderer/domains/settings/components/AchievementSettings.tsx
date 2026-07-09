import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AchievementUsageStats } from "@preload/api";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@shared/components/ui/select";
import { detectAchievementPromotion } from "../achievement-promotion-storage";
import {
	ACHIEVEMENT_SETS,
	DEFAULT_ACHIEVEMENT_SET_ID,
	getAchievementSetById,
	type Achievement,
} from "../achievements";
import { AchievementCarousel } from "./AchievementCarousel";
import { AchievementPromotionDialog } from "./AchievementPromotionDialog";

const EMPTY_USAGE_STATS: AchievementUsageStats = {
	activeDayStreak: 0,
	automationRuns: 0,
	batchRuns: 0,
	foregroundActiveMs: 0,
	interactiveSessions: 0,
	knowledgeBaseCount: 0,
	knowledgeBaseFileOperations: 0,
	longestConversationMessages: 0,
	longestConversationTurns: 0,
	messages: 0,
	projectsCreated: 0,
	todayActiveMs: 0,
	todayMessages: 0,
	toolsCompleted: 0,
	totalTokens: 0,
	turns: 0,
};

export function AchievementSettings(): JSX.Element {
	const { t } = useTranslation("settings");
	const [usageStats, setUsageStats] = useState<AchievementUsageStats>(EMPTY_USAGE_STATS);
	const [usageStatsLoaded, setUsageStatsLoaded] = useState(false);
	const [selectedSetId, setSelectedSetId] = useState(DEFAULT_ACHIEVEMENT_SET_ID);
	const [promotedAchievement, setPromotedAchievement] = useState<Achievement | null>(null);
	const promotionCheckedSetIdsRef = useRef(new Set<string>());
	const selectedSet = getAchievementSetById(selectedSetId);
	const achievements = selectedSet.achievements;

	useEffect(() => {
		void window.vetta.appMonitor
			.getAchievementUsage()
			.then((stats) => {
				setUsageStats(stats);
				setUsageStatsLoaded(true);
			})
			.catch(() => undefined);
	}, []);

	const currentIndex = achievements.reduce(
		(highestIndex, achievement, index) =>
			usageStats.foregroundActiveMs >= achievement.targetActiveMs ? index : highestIndex,
		0,
	);

	useEffect(() => {
		if (!usageStatsLoaded || promotionCheckedSetIdsRef.current.has(selectedSet.id)) return;
		promotionCheckedSetIdsRef.current.add(selectedSet.id);
		const promotedId = detectAchievementPromotion(selectedSet.id, achievements, currentIndex);
		if (!promotedId) return;
		setPromotedAchievement(
			achievements.find((achievement) => achievement.id === promotedId) ?? null,
		);
	}, [achievements, currentIndex, selectedSet.id, usageStatsLoaded]);

	const handlePromotionComplete = useCallback(() => {
		setPromotedAchievement(null);
	}, []);

	return (
		<>
			<div className="mx-auto w-full max-w-[920px] px-8 pb-28 pt-4">
				<div className="mb-4 flex items-center justify-end gap-2">
					<span className="text-[12px] text-muted-foreground">
						{t("achievement.setSelector")}
					</span>
					<Select
						value={selectedSet.id}
						onValueChange={(nextSetId) => {
							setPromotedAchievement(null);
							setSelectedSetId(nextSetId);
						}}
					>
						<SelectTrigger
							aria-label={t("achievement.setSelector")}
							className="min-w-40"
							size="sm"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{ACHIEVEMENT_SETS.map((set) => (
								<SelectItem key={set.id} value={set.id}>
									{t(set.labelKey, { defaultValue: set.id })}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<AchievementCarousel
					achievements={achievements}
					currentIndex={currentIndex}
					focusSizeEnabled={usageStatsLoaded}
					subtitleKey={selectedSet.subtitleKey}
					usageStats={usageStats}
				/>
			</div>
			{promotedAchievement && (
				<AchievementPromotionDialog
					achievement={promotedAchievement}
					onComplete={handlePromotionComplete}
				/>
			)}
		</>
	);
}
