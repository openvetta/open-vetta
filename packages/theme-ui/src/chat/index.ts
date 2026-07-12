import "../registry";
import type { ComponentType } from "react";
import type { InputBarBackground } from "./InputBarBackground";
import type {
	NewSessionGuidingWordsProps,
	NewSessionHeroProps,
	NewSessionSceneCarouselProps,
	NewSessionSkillBadgeRowProps,
} from "./NewSession";

declare module "@vetta/theme-sdk" {
	interface ThemeComponentRegistry {
		readonly "chat.inputBarBackground"?: typeof InputBarBackground;
		readonly "chat.newSessionGuidingWords"?: ComponentType<NewSessionGuidingWordsProps>;
		readonly "chat.newSessionHero"?: ComponentType<NewSessionHeroProps>;
		readonly "chat.newSessionSceneCarousel"?: ComponentType<NewSessionSceneCarouselProps>;
		readonly "chat.newSessionSkillBadgeRow"?: ComponentType<NewSessionSkillBadgeRowProps>;
	}
}

export type {
	AtPanelClassNames,
	AtPanelEntryModel,
	AtPanelLabels,
	AtPanelViewProps,
} from "./AtPanelView";
export { AtPanelView } from "./AtPanelView";
export { DefaultGuidingWords } from "./DefaultGuidingWords";
export type { InputBarBackgroundProps } from "./InputBarBackground";
export { InputBarBackground } from "./InputBarBackground";
export type {
	NewSessionGuidingWordsGroup,
	NewSessionGuidingWordsProps,
	NewSessionHeroProps,
	NewSessionSceneActionState,
	NewSessionSceneCarouselLabels,
	NewSessionSceneCarouselProps,
	NewSessionSceneItem,
	NewSessionSelection,
	NewSessionSkillBadgeRowLabels,
	NewSessionSkillBadgeRowProps,
	NewSessionSkillItem,
	NewSessionSkillSelection,
} from "./NewSession";
export type {
	SlashPanelClassNames,
	SlashPanelItemModel,
	SlashPanelLabels,
	SlashPanelSkillItem,
	SlashPanelViewProps,
} from "./SlashPanelView";
export { SlashPanelView } from "./SlashPanelView";
