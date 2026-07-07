import { cn } from "@shared/lib/utils";
import { useThemeComponent } from "@vetta/theme-sdk";
import { ThemeSurface } from "@vetta/theme-ui/appearance";
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
	const ThemedSidebarNavigation = useThemeComponent("sidebar.navigation", SidebarNavigation);

	return (
		<SidebarPanel
			className={classNames?.panel}
			contentClassName={classNames?.panelContent}
			width={model.width}
			onResize={model.actions.resize}
			onResizeEnd={model.actions.resizeEnd}
		>
			<div className={cn("relative shrink-0", classNames?.topBar)} data-theme-surface-root="sidebar.topBar">
				<ThemeSurface slot="sidebar.topBar" />
				<div className="relative z-10 overflow-hidden rounded-[inherit]">
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
				</div>
			</div>
			<div className={cn("relative shrink-0", classNames?.navigation)} data-theme-surface-root="sidebar.navigation">
				<ThemeSurface slot="sidebar.navigation" />
				<div className="relative z-10 overflow-hidden rounded-[inherit]">
					<ThemedSidebarNavigation
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
				</div>
			</div>
			<div
				className={cn("relative flex min-h-0 flex-1 flex-col", classNames?.projects)}
				data-theme-surface-root="sidebar.projects"
			>
				<ThemeSurface slot="sidebar.projects" />
				<div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[inherit]">
					<SidebarProjectsSection
						classNames={{
							list: classNames?.projectsList,
							toolbar: classNames?.projectsToolbar,
						}}
						filter={model.filter}
						onOpenSession={onOpenSession}
					/>
				</div>
			</div>
			<div className={cn("relative shrink-0", classNames?.bottomBar)} data-theme-surface-root="sidebar.bottomBar">
				<ThemeSurface slot="sidebar.bottomBar" />
				<div className="relative z-10 overflow-hidden rounded-[inherit]">
					<SidebarBottomBar classNames={{ settings: classNames?.bottomBarSettings }} />
				</div>
			</div>
		</SidebarPanel>
	);
}
