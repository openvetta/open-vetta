import { ACHIEVEMENT_UI_ASSETS } from "../achievement-ui-assets";
import { ACHIEVEMENT_SCENE_LAYOUT } from "../achievement-scene-layout";

export function AchievementTitle({ title }: { title: string }): JSX.Element {
	return (
		<div
			className="relative z-30 mx-auto flex max-w-full items-center justify-center"
			style={ACHIEVEMENT_SCENE_LAYOUT.title}
		>
			<img
				aria-hidden="true"
				alt=""
				draggable={false}
				src={ACHIEVEMENT_UI_ASSETS.title}
				className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
			/>
			<h1
				className="relative px-20 pb-1 text-center text-[20px] font-bold"
				style={{
					color: "#f4d58a",
					transform: `translateY(${ACHIEVEMENT_SCENE_LAYOUT.titleTextOffsetY}px)`,
				}}
			>
				{title}
			</h1>
		</div>
	);
}
