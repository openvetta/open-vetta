import { ACHIEVEMENT_UI_ASSETS } from "../achievement-ui-assets";
import { ACHIEVEMENT_SCENE_LAYOUT } from "../achievement-scene-layout";

export function AchievementCurtains(): JSX.Element {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 z-20 select-none"
		>
			<span
				className="absolute bg-no-repeat"
				style={{
					...ACHIEVEMENT_SCENE_LAYOUT.curtain.left,
					height: ACHIEVEMENT_SCENE_LAYOUT.curtain.height,
					aspectRatio: ACHIEVEMENT_SCENE_LAYOUT.curtain.aspectRatio,
					backgroundImage: `url("${ACHIEVEMENT_UI_ASSETS.curtain.left}")`,
					backgroundPosition: "center",
					backgroundSize: "contain",
				}}
			/>
			<span
				className="absolute bg-no-repeat"
				style={{
					...ACHIEVEMENT_SCENE_LAYOUT.curtain.right,
					height: ACHIEVEMENT_SCENE_LAYOUT.curtain.height,
					aspectRatio: ACHIEVEMENT_SCENE_LAYOUT.curtain.aspectRatio,
					backgroundImage: `url("${ACHIEVEMENT_UI_ASSETS.curtain.right}")`,
					backgroundPosition: "center",
					backgroundSize: "contain",
				}}
			/>
		</div>
	);
}
