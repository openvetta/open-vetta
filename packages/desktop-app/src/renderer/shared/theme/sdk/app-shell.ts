import type {
	PageHeaderContentProps,
	PageHeaderSidebarTrigger,
	PageHeaderTitle,
	PageHeaderWindowActions,
} from "@shared/app-shell/page-header";
import type { WindowControlButton, WindowControlsComponentProps } from "@shared/app-shell/window-controls";
import type { ComponentType } from "react";

export type {
	PageHeaderActionGroupProps,
	PageHeaderClassNames,
	PageHeaderContentProps,
	PageHeaderFrameProps,
	PageHeaderModel,
	PageHeaderProps,
	PageHeaderRegionProps,
	PageHeaderSidebarTriggerProps,
	PageHeaderTitleKey,
	PageHeaderTitleProps,
	PageHeaderWindowActionsProps,
} from "@shared/app-shell/page-header";
export {
	DefaultPageHeader,
	PageHeaderActionGroup,
	PageHeaderContent,
	PageHeaderFrame,
	PageHeaderSidebarTrigger,
	PageHeaderTitle,
	PageHeaderWindowActions,
} from "@shared/app-shell/page-header";
export type {
	WindowControlButtonProps,
	WindowControlItem,
	WindowControlKind,
	WindowControlsComponentProps,
	WindowControlsModel,
	WindowControlsProps,
} from "@shared/app-shell/window-controls";
export {
	DefaultWindowControls,
	WindowControlButton,
} from "@shared/app-shell/window-controls";
export { usePageHeaderModel, useWindowControlsModel } from "@vetta/theme-sdk/app-shell";

declare module "@vetta/theme-sdk" {
	interface ThemeComponentRegistry {
		readonly "app.pageHeaderContent"?: ComponentType<PageHeaderContentProps>;
		readonly "app.pageHeaderSidebarTrigger"?: typeof PageHeaderSidebarTrigger;
		readonly "app.pageHeaderTitle"?: typeof PageHeaderTitle;
		readonly "app.pageHeaderWindowActions"?: typeof PageHeaderWindowActions;
		readonly "app.windowControls"?: ComponentType<WindowControlsComponentProps>;
		readonly "app.windowControlButton"?: typeof WindowControlButton;
	}
}
