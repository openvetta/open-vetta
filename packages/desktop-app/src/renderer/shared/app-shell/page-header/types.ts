import type { ComponentPropsWithoutRef, ReactNode } from "react";

export type PageHeaderTitleKey =
	| "appShell.routeTitles.automation"
	| "appShell.routeTitles.batchTasks"
	| "appShell.routeTitles.knowledgeAll"
	| "appShell.routeTitles.knowledge"
	| "appShell.routeTitles.skills"
	| "appShell.routeTitles.settings"
	| "appShell.routeTitles.project"
	| "appShell.routeTitles.downloads"
	| "appShell.routeTitles.chat";

export interface PageHeaderProps {
	className?: string;
	classNames?: {
		actions?: string;
		content?: string;
		left?: string;
		sidebarTrigger?: string;
		title?: string;
	};
	narrow: boolean;
	onExpandSidebar: () => void;
	onOverlayClose: () => void;
	onOverlayOpen: () => void;
	sidebarCollapsed: boolean;
}

export interface PageHeaderModel {
	fallbackTitleKey?: PageHeaderTitleKey;
	leftSlot: ReactNode;
	path: string;
	rightSlot: ReactNode;
	sidebarTriggerTitle: string;
	title: string;
	titleBadge: ReactNode;
	titleHidden: boolean;
	triggerVisible: boolean;
}

export interface PageHeaderRegionProps extends PageHeaderProps {
	model: PageHeaderModel;
}

export interface PageHeaderSidebarTriggerProps extends Omit<ComponentPropsWithoutRef<"button">, "children"> {
	iconClassName?: string;
}
