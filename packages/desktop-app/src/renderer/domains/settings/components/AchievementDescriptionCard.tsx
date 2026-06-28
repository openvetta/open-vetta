import { useTranslation } from "react-i18next";
import { CornerImageFrame } from "@shared/components/CornerImageFrame";
import type { Achievement } from "../achievements";

const FRAME_ACCENT_COLOR = "#e0b278";
const FRAME_FOREGROUND_COLOR = "#f4e7d6";
const FRAME_MUTED_COLOR = "#cdb79e";
const FRAME_CURRENT_BACKGROUND = "rgba(224, 178, 120, 0.16)";

interface AchievementDescriptionCardProps {
	achievement: Achievement;
	current: boolean;
	index: number;
	total: number;
}

export function AchievementDescriptionCard({
	achievement,
	current,
	index,
	total,
}: AchievementDescriptionCardProps): JSX.Element {
	const { t } = useTranslation("settings");

	return (
		<CornerImageFrame
			imageUrl={achievement.frameUrl}
			decoration={achievement.frameDecoration}
			className="rounded-xl border transition-colors duration-200"
			contentClassName="px-10 py-4"
			style={achievement.surfaceColors}
		>
			<div className="flex items-center gap-2">
				<span
					className="text-[11px] font-medium"
					style={{ color: FRAME_ACCENT_COLOR }}
				>
					{t("achievement.stage", { current: index + 1, total })}
				</span>
				{current && (
					<span
						className="rounded-full px-2 py-0.5 text-[10px] font-medium"
						style={{
							backgroundColor: FRAME_CURRENT_BACKGROUND,
							color: FRAME_ACCENT_COLOR,
						}}
					>
						{t("achievement.current")}
					</span>
				)}
			</div>
			<h2
				className="mt-2 text-[15px] font-semibold"
				style={{ color: FRAME_FOREGROUND_COLOR }}
			>
				{t(`achievement.stages.${achievement.id}.name`)}
			</h2>
			<p
				className="mt-1 text-[12px] leading-5"
				style={{ color: FRAME_MUTED_COLOR }}
			>
				{t(`achievement.stages.${achievement.id}.meaning`)}
			</p>
		</CornerImageFrame>
	);
}
