import "../registry";
import type { ComponentType } from "react";
import type { InputBarBackground } from "./InputBarBackground";
import type {
	NewSessionGuidingWordsProps,
	NewSessionHeroProps,
	NewSessionSceneCarouselProps,
	NewSessionSkillBadgeRowProps,
} from "./NewSession";
import type { SceneCard } from "./SceneCard";
import type { SkillCard } from "./SkillCard";

declare module "@vetta/theme-sdk" {
	interface ThemeComponentRegistry {
		readonly "chat.inputBarBackground"?: typeof InputBarBackground;
		readonly "chat.newSessionGuidingWords"?: ComponentType<NewSessionGuidingWordsProps>;
		readonly "chat.newSessionHero"?: ComponentType<NewSessionHeroProps>;
		readonly "chat.newSessionSceneCard"?: typeof SceneCard;
		readonly "chat.newSessionSceneCarousel"?: ComponentType<NewSessionSceneCarouselProps>;
		readonly "chat.newSessionSkillBadgeRow"?: ComponentType<NewSessionSkillBadgeRowProps>;
		readonly "chat.newSessionSkillCard"?: typeof SkillCard;
	}
}

export type {
	AtPanelClassNames,
	AtPanelEntryModel,
	AtPanelLabels,
	AtPanelViewProps,
} from "./AtPanelView";
export { AtPanelView } from "./AtPanelView";
export type { CopyIconButtonLabels, CopyIconButtonProps } from "./CopyIconButton";
export { CopyIconButton } from "./CopyIconButton";
export { DefaultGuidingWords } from "./DefaultGuidingWords";
export { DefaultSceneCarousel } from "./DefaultSceneCarousel";
export { DefaultSkillBadgeRow } from "./DefaultSkillBadgeRow";
export type { DrawerCardProps, DrawerTab } from "./DrawerCard";
export { DrawerCard } from "./DrawerCard";
export type { InputBarBackgroundProps } from "./InputBarBackground";
export { InputBarBackground } from "./InputBarBackground";
export type { InputBarCapsuleLabels, InputBarCapsuleProps } from "./InputBarCapsule";
export { InputBarCapsule } from "./InputBarCapsule";
export type { InputBarToolbarButtonProps } from "./InputBarToolbarButton";
export { InputBarToolbarButton } from "./InputBarToolbarButton";
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
export { NewSessionBackground } from "./NewSessionBackground";
export type {
	SandboxPermissionCardLabels,
	SandboxPermissionCardProps,
	SandboxPermissionRequestModel,
} from "./SandboxPermissionCard";
export { SandboxPermissionCard } from "./SandboxPermissionCard";
export type {
	SceneCardActionState,
	SceneCardClassNames,
	SceneCardModel,
	SceneCardProps,
	SceneCardState,
} from "./SceneCard";
export { SceneCard } from "./SceneCard";
export type { SendButtonLabels, SendButtonProps } from "./SendButton";
export { SendButton } from "./SendButton";
export type { SkillCardClassNames, SkillCardModel, SkillCardProps } from "./SkillCard";
export { SkillCard } from "./SkillCard";
export type {
	SlashPanelClassNames,
	SlashPanelItemModel,
	SlashPanelLabels,
	SlashPanelSkillItem,
	SlashPanelViewProps,
} from "./SlashPanelView";
export { SlashPanelView } from "./SlashPanelView";
export type { TextPreviewLabels, TextPreviewProps } from "./TextPreview";
export { TextPreview } from "./TextPreview";
export type { TodoCardItem, TodoCardLabels, TodoCardProps } from "./TodoCard";
export { TodoCard } from "./TodoCard";
