import { ACHIEVEMENTS } from "../achievements";
import { AchievementCarousel } from "./AchievementCarousel";

const PLACEHOLDER_CURRENT_ACHIEVEMENT_INDEX = 0;

export function AchievementSettings(): JSX.Element {
	return (
		<div className="mx-auto w-full max-w-[920px] px-8 py-4">
			<AchievementCarousel
				achievements={ACHIEVEMENTS}
				currentIndex={PLACEHOLDER_CURRENT_ACHIEVEMENT_INDEX}
			/>
		</div>
	);
}
