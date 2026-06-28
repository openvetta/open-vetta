import { useTranslation } from "react-i18next";
import { ACHIEVEMENTS } from "../achievements";
import { AchievementCarousel } from "./AchievementCarousel";

const PLACEHOLDER_CURRENT_ACHIEVEMENT_INDEX = 0;

export function AchievementSettings(): JSX.Element {
	const { t } = useTranslation("settings");

	return (
		<div className="mx-auto w-full max-w-[920px] px-8 py-4">
			<h1 className="text-[20px] font-bold text-foreground">{t("achievement.title")}</h1>
			<p className="mt-1 text-[12px] text-muted-foreground">{t("achievement.subtitle")}</p>
			<div className="mt-6 overflow-hidden rounded-xl border border-border/50 bg-muted p-4">
				<AchievementCarousel
					achievements={ACHIEVEMENTS}
					currentIndex={PLACEHOLDER_CURRENT_ACHIEVEMENT_INDEX}
				/>
			</div>
		</div>
	);
}
