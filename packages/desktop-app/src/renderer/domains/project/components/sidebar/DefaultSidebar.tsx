import { ThemeSurface } from "@shared/theme/appearance";
import { cn } from "@shared/lib/utils";
import { SidebarPanel } from "./SidebarPanel";
import { SidebarBottomBar } from "./SidebarBottomBar";
import { SidebarNavigation } from "./SidebarNavigation";
import { SidebarProjectsSection } from "./SidebarProjectsSection";
import { SidebarTopBar } from "./SidebarTopBar";
import type { SidebarModel, SidebarProps } from "./types";

interface DefaultSidebarProps {
	classNames?: SidebarProps["classNames"];
	model: SidebarModel;
	onOpenSession: SidebarProps["onOpenSession"];
}

export function DefaultSidebar({ classNames, model, onOpenSession }: DefaultSidebarProps): JSX.Element {
	return (
		<SidebarPanel
			className={classNames?.panel}
			contentClassName={classNames?.panelContent}
			width={model.width}
			onResize={model.actions.resize}
			onResizeEnd={model.actions.resizeEnd}
		>
			<ThemeSurface slot="sidebar.topBar" className={cn("shrink-0", classNames?.topBar)}>
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
			</ThemeSurface>
			<ThemeSurface slot="sidebar.navigation" className={cn("shrink-0", classNames?.navigation)}>
				<SidebarNavigation
					classNames={{
						indicator: classNames?.navIndicator,
						item: classNames?.navItem,
						itemBadge: classNames?.navItemBadge,
						itemIcon: classNames?.navItemIcon,
						itemLabel: classNames?.navItemLabel,
					}}
					items={model.navItems}
					indicatorBounds={model.navIndicatorBounds}
					onItemClick={model.actions.openNavItem}
					setItemRef={model.setNavItemRef}
				/>
			</ThemeSurface>
			<ThemeSurface slot="sidebar.projects" className={cn("flex min-h-0 flex-1 flex-col", classNames?.projects)}>
				<SidebarProjectsSection
					classNames={{
						list: classNames?.projectsList,
						toolbar: classNames?.projectsToolbar,
					}}
					filter={model.filter}
					onOpenSession={onOpenSession}
				/>
			</ThemeSurface>
			<ThemeSurface slot="sidebar.bottomBar" className={cn("shrink-0", classNames?.bottomBar)}>
				<SidebarBottomBar classNames={{ settings: classNames?.bottomBarSettings }} />
			</ThemeSurface>
		</SidebarPanel>
	);
}
