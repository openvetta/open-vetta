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

export type { ActionButtonBarItem, ActionButtonBarViewProps } from "./ActionButtonBarView";
export { ActionButtonBarView } from "./ActionButtonBarView";
export type { AppshotCardViewLabels, AppshotCardViewProps } from "./AppshotCardView";
export { AppshotCardView } from "./AppshotCardView";
export type {
	AtPanelClassNames,
	AtPanelEntryModel,
	AtPanelLabels,
	AtPanelViewProps,
} from "./AtPanelView";
export { AtPanelView } from "./AtPanelView";
export type { BackgroundTasksBadgeViewProps } from "./BackgroundTasksBadgeView";
export { BackgroundTasksBadgeView } from "./BackgroundTasksBadgeView";
export type { ChatExportHostViewProps } from "./ChatExportHostView";
export { ChatExportHostView } from "./ChatExportHostView";
export type { ContextRingViewProps } from "./ContextRingView";
export { CIRCUMFERENCE as CONTEXT_RING_CIRCUMFERENCE, ContextRingView } from "./ContextRingView";
export type { CopyIconButtonLabels, CopyIconButtonProps } from "./CopyIconButton";
export { CopyIconButton } from "./CopyIconButton";
export { DefaultGuidingWords } from "./DefaultGuidingWords";
export { DefaultSceneCarousel } from "./DefaultSceneCarousel";
export { DefaultSkillBadgeRow } from "./DefaultSkillBadgeRow";
export type { DrawerCardProps, DrawerTab } from "./DrawerCard";
export { DrawerCard } from "./DrawerCard";
export type {
	DiffLineKind,
	DiffLineView,
	DiffPreviewViewProps,
	EditTextFallbackViewProps,
} from "./EditDiffView";
export { DiffPreviewView, EditTextFallbackView } from "./EditDiffView";
export type { InputBarBackgroundProps } from "./InputBarBackground";
export { InputBarBackground } from "./InputBarBackground";
export type { InputBarCapsuleLabels, InputBarCapsuleProps } from "./InputBarCapsule";
export { InputBarCapsule } from "./InputBarCapsule";
export type { InputBarToolbarButtonProps } from "./InputBarToolbarButton";
export { InputBarToolbarButton } from "./InputBarToolbarButton";
export type {
	KbFilterByTagsViewProps,
	KbFilterPageItem,
	KbListTagsViewProps,
	KbTagItem,
	KbWritePageViewProps,
} from "./KnowledgeToolViews";
export { KbFilterByTagsView, KbListTagsView, KbWritePageView } from "./KnowledgeToolViews";
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
export type { QueueCardItem, QueueCardViewLabels, QueueCardViewProps } from "./QueueCardView";
export { QueueCardView } from "./QueueCardView";
export type { ReadImageViewProps } from "./ReadImageView";
export { ReadImageView } from "./ReadImageView";
export type {
	SandboxGrantsBadgeViewLabels,
	SandboxGrantsBadgeViewProps,
	SandboxGrantViewItem,
} from "./SandboxGrantsBadgeView";
export { SandboxGrantsBadgeView } from "./SandboxGrantsBadgeView";
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
export type { SuggestionBubblesViewProps } from "./SuggestionBubblesView";
export { SuggestionBubblesView } from "./SuggestionBubblesView";
export type { TextPreviewLabels, TextPreviewProps } from "./TextPreview";
export { TextPreview } from "./TextPreview";
export type { TodoCardItem, TodoCardLabels, TodoCardProps } from "./TodoCard";
export { TodoCard } from "./TodoCard";
export type { UsageBarViewProps } from "./UsageBarView";
export { UsageBarView } from "./UsageBarView";
export type { WriteContentViewProps } from "./WriteContentView";
export { WriteContentView } from "./WriteContentView";
