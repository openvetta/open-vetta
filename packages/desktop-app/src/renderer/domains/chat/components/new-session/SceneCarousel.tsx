import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useThemeComponent } from "@vetta/theme-sdk";
import {
	DefaultSceneCarousel,
	type NewSessionSceneItem,
} from "@vetta/theme-ui/chat";
import type { SceneActionState, SceneItem, SkillSelection } from "./types";

export { DefaultSceneCarousel } from "@vetta/theme-ui/chat";

interface SceneCarouselProps {
	actions: Record<string, SceneActionState>;
	onSceneClick: (scene: SceneItem) => void;
	scenes: SceneItem[];
	selected: SkillSelection;
}

/** Connected: i18n labels + registry, pure carousel in theme-ui. */
export function SceneCarousel({ scenes, selected, actions, onSceneClick }: SceneCarouselProps): JSX.Element {
	const { t } = useTranslation("chat");
	const ThemedSceneCarousel = useThemeComponent("chat.newSessionSceneCarousel", DefaultSceneCarousel);
	const handleSceneClick = useCallback(
		(scene: NewSessionSceneItem) => {
			const matched = scenes.find((item) => item.name === scene.name);
			if (matched) {
				onSceneClick(matched);
			}
		},
		[onSceneClick, scenes],
	);

	return (
		<ThemedSceneCarousel
			actions={actions}
			labels={{
				installPrompt: t("newSession.sceneInstallPrompt"),
				next: t("newSession.sceneCarouselNext"),
				previous: t("newSession.sceneCarouselPrev"),
			}}
			onSceneClick={handleSceneClick}
			scenes={scenes}
			selected={selected}
		/>
	);
}
