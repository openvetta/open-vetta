import type { ActivityPanelFrame } from "./ActivityPanelFrame";

declare module "@vetta/theme-sdk" {
	interface ThemeComponentRegistry {
		readonly "activity.panelFrame"?: typeof ActivityPanelFrame;
	}
}

export type { ActivityPanelFrameProps } from "./ActivityPanelFrame";
export { ActivityPanelFrame } from "./ActivityPanelFrame";
