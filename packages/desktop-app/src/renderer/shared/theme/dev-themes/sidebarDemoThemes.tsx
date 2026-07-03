import { forwardRef } from "react";
import {
	InputBarBackground,
	type InputBarBackgroundProps,
} from "@domains/chat/components/input-bar/InputBarBackground";
import { AppBackground, type AppBackgroundProps } from "../../../root-layout/app-background/AppBackground";
import { cn } from "@shared/lib/utils";
import { ThemeSurface } from "@vetta/theme-ui/appearance";
import {
	SettingsMenuTrigger,
	SidebarBottomBar,
	SidebarNavItemButton,
	SidebarNavigation,
	SidebarPanel,
	SidebarProjectsSection,
	SidebarTopBar,
	type SettingsMenuTriggerProps,
	type SidebarNavItemButtonProps,
	type SidebarRegionProps,
} from "@shared/theme/sdk";
import type { ThemeModule } from "@vetta/theme-sdk";

const sidebarDemoFrame = {
	kind: "nine-slice-image",
	imageUrl: "./theme-demo/new-session-scene-card.webp",
	decoration: {
		borderWidth: "12px",
		outset: "2px",
		repeat: "stretch",
		slice: 96,
	},
} as const;

function DemoAppBackground({
	className,
	...props
}: AppBackgroundProps): JSX.Element {
	return (
		<AppBackground
			className={className}
			{...props}
		>
			<img
				alt=""
				aria-hidden="true"
				className="absolute right-[2%] top-[3%] z-10 w-[clamp(280px,38vw,640px)] object-contain"
				src="./theme-demo/white-glaze-immortal.webp"
			/>
			<img
				alt=""
				aria-hidden="true"
				className="absolute right-[1%] top-[2%] z-20 w-[clamp(90px,12vw,180px)] object-contain"
				src="./theme-demo/white-glaze-gourd.webp"
			/>
		</AppBackground>
	);
}

function DemoInputBarBackground({
	className,
	...props
}: InputBarBackgroundProps): JSX.Element {
	return (
		<InputBarBackground
			className={className}
			{...props}
		>
			<img
				alt=""
				aria-hidden="true"
				className="absolute -right-3 bottom-0 h-[145%] w-auto max-w-[48%] object-contain object-right-bottom"
				src="./theme-demo/input-bar-background.webp"
			/>
		</InputBarBackground>
	);
}

export const sidebarAppearanceDemoTheme: ThemeModule = {
	meta: {
		id: "demo-sidebar-appearance",
		name: "Demo Sidebar Appearance",
		sdkVersion: "0.1.0",
		version: "0.1.0",
	},
	appearance: {
		surfaces: {
			"activity.panel": {
				frame: sidebarDemoFrame,
			},
			"app.frame": {
				frame: {
					kind: "background-image",
					imageUrl: "./theme-demo/app_background.webp",
					decoration: {
						position: "center",
						repeat: "no-repeat",
						size: "cover",
					},
				},
			},
			"sidebar.panel": {
				frame: sidebarDemoFrame,
				rootClassName: "bg-transparent",
				surfaceClassName: "bg-primary-foreground/80",
			},
			"sidebar.navigationIndicator": {
				frame: {
					kind: "nine-slice-image",
					imageUrl: "./theme-demo/button_background.webp",
					decoration: {
						borderWidth: "8px",
						outset: "3px",
						repeat: "stretch",
						slice: 90,
					},
				},
			},
			"chat.atPanel": {
				frame: sidebarDemoFrame,
			},
			"chat.newSessionPage": {
				rootClassName: "bg-transparent",
			},
			"chat.sessionViewerPage": {
				rootClassName: "bg-transparent",
			},
			"chat.view": {
				rootClassName: "bg-transparent",
			},
			"chat.executionModeMenu": {
				frame: sidebarDemoFrame,
			},
			"chat.inputBar": {
				frame: sidebarDemoFrame,
				rootClassName: "border-transparent bg-transparent dark:bg-transparent",
				surfaceClassName: "z-[2]",
			},
			"chat.inputDrawer": {
				frame: sidebarDemoFrame,
			},
			"chat.modelSelectorMenu": {
				frame: sidebarDemoFrame,
			},
			"chat.modelSelectorReasoningMenu": {
				frame: sidebarDemoFrame,
			},
			"chat.newSessionSceneCard": {
				frame: sidebarDemoFrame,
				rootClassName: "border-transparent bg-transparent",
			},
			"chat.newSessionSkillCard": {
				frame: {
					kind: "nine-slice-image",
					imageUrl: "./theme-demo/new-session-skill-card.webp",
					decoration: {
						borderWidth: "10px",
						outset: "2px",
						repeat: "stretch",
						slice: 110,
					},
				},
				rootClassName: "border-transparent bg-transparent",
			},
			"chat.questionPanel": {
				frame: sidebarDemoFrame,
			},
			"chat.slashPanel": {
				frame: sidebarDemoFrame,
			},
			"root.confirmDialog.panel": {
				frame: sidebarDemoFrame,
			},
			"root.filePreviewDialog": {
				frame: sidebarDemoFrame,
			},
			"root.filePreviewDialog.panel": {
				frame: sidebarDemoFrame,
			},
			"root.flowingSendDialog.panel": {
				frame: sidebarDemoFrame,
			},
			"root.genericActionApproval.panel": {
				frame: sidebarDemoFrame,
			},
			"root.knowledgeDropOverlay": {
				frame: sidebarDemoFrame,
			},
			"root.loginDialog.panel": {
				frame: sidebarDemoFrame,
			},
			"root.approval.appearance.panel": {
				frame: sidebarDemoFrame,
			},
			"root.approval.batchTasks.panel": {
				frame: sidebarDemoFrame,
			},
			"root.approval.navigationOpen.panel": {
				frame: sidebarDemoFrame,
			},
			"root.approval.schedulerAction.panel": {
				frame: sidebarDemoFrame,
			},
			"root.approval.schedulerEdit.panel": {
				frame: sidebarDemoFrame,
			},
			"root.updateRestartDialog.panel": {
				frame: sidebarDemoFrame,
			},
			"root.workflowCompleteDialog.panel": {
				frame: sidebarDemoFrame,
			},
			"settings.pageContent": {
				rootClassName: "bg-transparent",
			},
		},
	},
	components: {
		"app.background": DemoAppBackground,
		"chat.inputBarBackground": DemoInputBarBackground,
	},
};

const DemoSidebarNavItemButton = forwardRef<HTMLButtonElement, SidebarNavItemButtonProps>(
	function DemoSidebarNavItemButton({ className, classNames, ...props }, ref): JSX.Element {
		return (
			<SidebarNavItemButton
				ref={ref}
				className={cn(
					"mx-1 rounded-lg border border-border/50 bg-card/40 px-2.5 py-2 hover:border-primary/40 hover:bg-primary/10",
					props.item.active && "border-primary/50 bg-primary/15",
					className,
				)}
				classNames={{
					...classNames,
					icon: cn("rounded-md bg-primary/10 p-0.5 text-primary", classNames?.icon),
					label: cn("font-medium", classNames?.label),
				}}
				{...props}
			/>
		);
	},
);

const DemoSettingsMenuTrigger = forwardRef<HTMLButtonElement, SettingsMenuTriggerProps>(
	function DemoSettingsMenuTrigger({ className, ...props }, ref): JSX.Element {
		return (
			<SettingsMenuTrigger
				ref={ref}
				className={cn(
					"border border-border/50 bg-card/40 hover:border-primary/40 hover:bg-primary/10",
					className,
				)}
				{...props}
			/>
		);
	},
);

export const sidebarComponentDemoTheme: ThemeModule = {
	...sidebarAppearanceDemoTheme,
	meta: {
		id: "demo-sidebar-components",
		name: "Demo Sidebar Components",
		sdkVersion: "0.1.0",
		version: "0.1.0",
	},
	components: {
		"sidebar.navItem": DemoSidebarNavItemButton,
		"sidebar.settingsTrigger": DemoSettingsMenuTrigger,
	},
};

function DemoSidebarRegion({ classNames, model, onOpenSession }: SidebarRegionProps): JSX.Element {
	return (
		<SidebarPanel
			className={cn("bg-card", classNames?.panel)}
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
			<div className="relative shrink-0 px-2 pb-1" data-theme-surface-root="sidebar.navigation">
				<ThemeSurface slot="sidebar.navigation" />
				<div className="relative z-10 flex h-8 items-center gap-1 overflow-hidden rounded-lg border border-border/40 bg-muted/40 px-2">
					<span className="icon-[solar--stars-line-duotone] h-3.5 w-3.5 text-primary" />
					<span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
					<span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
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
			<div className={cn("relative shrink-0", classNames?.navigation)} data-theme-surface-root="sidebar.navigation">
				<ThemeSurface slot="sidebar.navigation" />
				<div className="relative z-10 overflow-hidden rounded-[inherit]">
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

export const sidebarRegionDemoTheme: ThemeModule = {
	...sidebarComponentDemoTheme,
	meta: {
		id: "demo-sidebar-region",
		name: "Demo Sidebar Region",
		sdkVersion: "0.1.0",
		version: "0.1.0",
	},
	regions: {
		sidebar: DemoSidebarRegion,
	},
};
