import type { ActivityPanelFrame } from "./ActivityPanelFrame";

declare module "@vetta/theme-sdk" {
	interface ThemeComponentRegistry {
		readonly "activity.panelFrame"?: typeof ActivityPanelFrame;
	}
}

export type { ActivityPanelFrameProps } from "./ActivityPanelFrame";
export { ActivityPanelFrame } from "./ActivityPanelFrame";
export type { CodePreviewProps } from "./CodePreview";
export { CodePreview } from "./CodePreview";
export type { TodoTabPanelViewProps } from "./TodoTabPanelView";
export { TodoTabPanelView } from "./TodoTabPanelView";
