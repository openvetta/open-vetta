import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@shared/components/ui/select";
import { AchievementCarousel } from "./AchievementCarousel";
import { AchievementPromotionDialog } from "./AchievementPromotionDialog";
import type { AchievementSettingsModel } from "./useAchievementSettingsModel";

export function AchievementSettingsView(model: AchievementSettingsModel): JSX.Element {
	return (
		<>
			<div className="mx-auto w-full max-w-[920px] px-8 pb-28 pt-4">
				<div className="mb-4 flex items-center justify-end gap-2">
					<span className="text-[12px] text-muted-foreground">{model.labels.setSelector}</span>
					<Select value={model.selectedSetId} onValueChange={model.onSelectSetId}>
						<SelectTrigger aria-label={model.labels.setSelector} className="min-w-40" size="sm">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{model.setOptions.map((set) => (
								<SelectItem key={set.id} value={set.id}>
									{set.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<AchievementCarousel
					achievements={model.achievements}
					currentIndex={model.currentIndex}
					focusSizeEnabled={model.focusSizeEnabled}
					subtitleKey={model.subtitleKey}
					usageStats={model.usageStats}
				/>
			</div>
			{model.promotedAchievement && (
				<AchievementPromotionDialog
					achievement={model.promotedAchievement}
					onComplete={model.onPromotionComplete}
				/>
			)}
		</>
	);
}
