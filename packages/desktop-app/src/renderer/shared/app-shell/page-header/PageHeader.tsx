import { AnimatePresence, motion } from "motion/react";
import { isMac } from "@shared/lib/platform";
import { cn } from "@shared/lib/utils";
import { useThemeComponent, useThemeRegion } from "@vetta/theme-sdk";
import { usePageHeaderModel } from "@vetta/theme-sdk/app-shell";
import { ThemeSurface } from "@vetta/theme-ui/appearance";
import { PageHeaderSidebarTrigger } from "./PageHeaderSidebarTrigger";
import { PageHeaderTitle } from "./PageHeaderTitle";
import { PageHeaderWindowActions } from "./PageHeaderWindowActions";
import type { PageHeaderProps, PageHeaderRegionProps } from "./types";

export function DefaultPageHeader({
	className,
	classNames,
	model,
	narrow,
	onExpandSidebar,
	onOverlayClose,
	onOverlayOpen,
}: PageHeaderRegionProps): JSX.Element {
	const ThemeSidebarTrigger = useThemeComponent("app.pageHeaderSidebarTrigger", PageHeaderSidebarTrigger);
	const ThemePageHeaderTitle = useThemeComponent("app.pageHeaderTitle", PageHeaderTitle);
	const ThemePageHeaderWindowActions = useThemeComponent("app.pageHeaderWindowActions", PageHeaderWindowActions);

	return (
		<div
			className={cn(
				"drag-region relative flex h-11 shrink-0 items-center justify-between gap-2 overflow-visible",
				!isMac && "h-8",
				className,
			)}
			data-theme-surface-root="app.pageHeader"
			style={{
				paddingLeft: isMac && model.triggerVisible ? 78 : 12,
				paddingRight: isMac ? 12 : 0,
				marginBottom: isMac ? 0 : 10,
			}}
		>
			<ThemeSurface slot="app.pageHeader" />
			<div className={cn("relative z-10 flex min-w-0 flex-1 items-center justify-between gap-2", classNames?.content)}>
				<div className={cn("no-drag flex min-w-0 items-center gap-2", classNames?.left)}>
					<AnimatePresence initial={false}>
						{model.triggerVisible && (
							<motion.div
								key="expand"
								initial={{ opacity: 0, scale: 0.85, width: 0 }}
								animate={{ opacity: 1, scale: 1, width: 28 }}
								exit={{ opacity: 0, scale: 0.85, width: 0 }}
								transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
								className="shrink-0 overflow-hidden"
							>
								<ThemeSidebarTrigger
									title={model.sidebarTriggerTitle}
									onClick={narrow ? onOverlayOpen : onExpandSidebar}
									onMouseEnter={narrow ? onOverlayOpen : undefined}
									onMouseLeave={narrow ? onOverlayClose : undefined}
									className={classNames?.sidebarTrigger}
								/>
							</motion.div>
						)}
					</AnimatePresence>
					{model.leftSlot}
					{!model.titleHidden && <ThemePageHeaderTitle title={model.title} className={classNames?.title} />}
					{model.titleBadge}
				</div>
				<ThemePageHeaderWindowActions className={classNames?.actions}>
					{model.rightSlot}
				</ThemePageHeaderWindowActions>
			</div>
		</div>
	);
}

export function PageHeader(props: PageHeaderProps): JSX.Element {
	const model = usePageHeaderModel(props);
	const ThemePageHeader = useThemeRegion("app.pageHeader");
	if (ThemePageHeader) {
		return <ThemePageHeader {...props} model={model} />;
	}
	return <DefaultPageHeader {...props} model={model} />;
}
