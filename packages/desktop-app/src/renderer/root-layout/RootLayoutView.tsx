import { Outlet } from "@tanstack/react-router";
import { ThemeSurface } from "@vetta/theme-ui/appearance";
import { AppFrame, MainContentFrame, SidebarDock, SidebarOverlay } from "@vetta/theme-ui/layout";
import { useThemeComponent, useThemeSurface } from "@vetta/theme-sdk";
import { Sidebar } from "../domains/project/components/sidebar/Sidebar";
import { PageHeader } from "../shared/app-shell/page-header";
import { TooltipProvider } from "../shared/components/ui/tooltip";
import { AppBackground } from "./app-background/AppBackground";
import { RootGlobalOverlays } from "./RootGlobalOverlays";
import type { RootLayoutModel } from "./types";
import { useActiveThemePageRoute } from "../shared/theme/pages";

interface RootLayoutViewProps {
	model: RootLayoutModel;
}

export function RootLayoutView({ model }: RootLayoutViewProps): JSX.Element {
	const ThemedAppBackground = useThemeComponent("app.background", AppBackground);
	const appFrameSurface = useThemeSurface("app.frame");
	const themePageRoute = useActiveThemePageRoute();
	const pageLayout = themePageRoute?.page ? themePageRoute.layout : "content";
	const {
		actions,
		narrow,
		onOpenSession,
		overlayOpen,
		sidebarCollapsed,
	} = model;
	const showSidebar = pageLayout !== "app";
	const pageHeader =
		pageLayout === "content" ? (
			<PageHeader
				sidebarCollapsed={sidebarCollapsed}
				narrow={narrow}
				onExpandSidebar={actions.toggleSidebar}
				onOverlayOpen={actions.openOverlay}
				onOverlayClose={actions.scheduleOverlayClose}
			/>
		) : null;

	return (
		<TooltipProvider>
			<AppFrame
				className={appFrameSurface?.rootClassName}
				decoration={<ThemedAppBackground />}
				overlay={<ThemeSurface className="z-20" slot="app.frameOverlay" />}
			>
				{showSidebar && (
					<>
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
					</>
				)}
				{pageLayout === "app" ? (
					<div className="flex min-h-0 min-w-[320px] flex-1 overflow-visible">
						<Outlet />
					</div>
				) : (
					<MainContentFrame header={pageHeader}>
						<Outlet />
					</MainContentFrame>
				)}
				<RootGlobalOverlays />
			</AppFrame>
		</TooltipProvider>
	);
}
