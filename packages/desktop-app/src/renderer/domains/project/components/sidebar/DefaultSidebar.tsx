import { DefaultSidebar as ThemeDefaultSidebar } from "@vetta/theme-ui/sidebar";
import type { SidebarModel, SidebarProps } from "./types";
import { SidebarBottomBar } from "./SidebarBottomBar";
import { SidebarProjectsSection } from "./SidebarProjectsSection";
import { SidebarTopBar } from "./SidebarTopBar";

interface DefaultSidebarProps {
	classNames?: SidebarProps["classNames"];
	model: SidebarModel;
	onOpenSession: SidebarProps["onOpenSession"];
}

/**
 * Desktop default sidebar: props-driven shell from theme-ui + host-owned section trees.
 */
export function DefaultSidebar({ classNames, model, onOpenSession }: DefaultSidebarProps): JSX.Element {
	return (
		<ThemeDefaultSidebar
			classNames={classNames}
			model={model}
			topBar={
				<SidebarTopBar
					classNames={{
						actions: classNames?.topBarActions,
						brand: classNames?.topBarBrand,
						clawButton: classNames?.topBarClawButton,
						collapseButton: classNames?.topBarCollapseButton,
					}}
					floating={model.floating}
					imOnline={model.imOnline}
					onCollapse={model.actions.collapse}
					onOpenClawSettings={model.actions.openClawSettings}
				/>
			}
			projects={
				<SidebarProjectsSection
					classNames={{
						list: classNames?.projectsList,
						toolbar: classNames?.projectsToolbar,
					}}
					filter={model.filter}
					onOpenSession={onOpenSession}
				/>
			}
			bottomBar={<SidebarBottomBar classNames={{ settings: classNames?.bottomBarSettings }} />}
		/>
	);
}
