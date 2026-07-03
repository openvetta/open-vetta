import { Outlet } from "@tanstack/react-router";
import { AppFrame, MainContentFrame, SidebarDock, SidebarOverlay } from "@vetta/theme-ui/layout";
import { useThemeComponent } from "@vetta/theme-sdk";
import { Sidebar } from "../domains/project/components/sidebar/Sidebar";
import { PageHeader } from "../shared/app-shell/page-header";
import { TooltipProvider } from "../shared/components/ui/tooltip";
import { AppBackground } from "./app-background/AppBackground";
import { RootGlobalOverlays } from "./RootGlobalOverlays";
import type { RootLayoutModel } from "./types";

interface RootLayoutViewProps {
	model: RootLayoutModel;
}

export function RootLayoutView({ model }: RootLayoutViewProps): JSX.Element {
	const ThemedAppBackground = useThemeComponent("app.background", AppBackground);
	const {
		actions,
		narrow,
		onOpenSession,
		overlayOpen,
		sidebarCollapsed,
	} = model;

	return (
		<TooltipProvider>
			<AppFrame decoration={<ThemedAppBackground />}>
				<SidebarDock visible={!narrow && !sidebarCollapsed}>
					<Sidebar onOpenSession={onOpenSession} onCollapse={actions.toggleSidebar} />
				</SidebarDock>
				<SidebarOverlay
					visible={narrow && overlayOpen}
					onMouseEnter={actions.openOverlay}
					onMouseLeave={actions.scheduleOverlayClose}
				>
					<Sidebar onOpenSession={onOpenSession} onCollapse={actions.closeOverlay} floating />
				</SidebarOverlay>
				<MainContentFrame
					header={
						<PageHeader
							sidebarCollapsed={sidebarCollapsed}
							narrow={narrow}
							onExpandSidebar={actions.toggleSidebar}
							onOverlayOpen={actions.openOverlay}
							onOverlayClose={actions.scheduleOverlayClose}
						/>
					}
				>
					<Outlet />
				</MainContentFrame>
				<RootGlobalOverlays />
			</AppFrame>
		</TooltipProvider>
	);
}
