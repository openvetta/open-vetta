import { SidebarPanel } from "./SidebarPanel";
import { SidebarBottomBar } from "./SidebarBottomBar";
import { SidebarNavigation } from "./SidebarNavigation";
import { SidebarProjectsSection } from "./SidebarProjectsSection";
import { SidebarTopBar } from "./SidebarTopBar";
import type { SidebarModel, SidebarProps } from "./types";

interface DefaultSidebarProps {
	model: SidebarModel;
	onOpenSession: SidebarProps["onOpenSession"];
}

export function DefaultSidebar({ model, onOpenSession }: DefaultSidebarProps): JSX.Element {
	return (
		<SidebarPanel
			width={model.width}
			onResize={model.actions.resize}
			onResizeEnd={model.actions.resizeEnd}
		>
			<SidebarTopBar
				floating={model.floating}
				imOnline={model.imOnline}
				onCollapse={model.actions.collapse}
				onOpenClawSettings={model.actions.openClawSettings}
			/>
			<SidebarNavigation
				items={model.navItems}
				indicatorBounds={model.navIndicatorBounds}
				onItemClick={model.actions.openNavItem}
				setItemRef={model.setNavItemRef}
			/>
			<SidebarProjectsSection
				filter={model.filter}
				listScrollParent={model.listScrollParent}
				onOpenSession={onOpenSession}
				setListScrollParent={model.setListScrollParent}
			/>
			<SidebarBottomBar />
		</SidebarPanel>
	);
}
