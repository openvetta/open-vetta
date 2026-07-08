import { AnimatePresence, motion } from "motion/react";
import { useThemeComponent } from "@vetta/theme-sdk";
import { PageHeaderSidebarTrigger } from "./PageHeaderSidebarTrigger";
import { PageHeaderTitle } from "./PageHeaderTitle";
import { PageHeaderWindowActions } from "./PageHeaderWindowActions";
import type { PageHeaderContentProps } from "./types";
import { cn } from "@shared/lib/utils";

export function PageHeaderContent({
	actions,
	classNames,
	model,
	narrow,
}: PageHeaderContentProps): JSX.Element {
	const ThemeSidebarTrigger = useThemeComponent("app.pageHeaderSidebarTrigger", PageHeaderSidebarTrigger);
	const ThemePageHeaderTitle = useThemeComponent("app.pageHeaderTitle", PageHeaderTitle);
	const ThemePageHeaderWindowActions = useThemeComponent("app.pageHeaderWindowActions", PageHeaderWindowActions);

	return (
		<>
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
								onClick={narrow ? actions.onOverlayOpen : actions.onExpandSidebar}
								onMouseEnter={narrow ? actions.onOverlayOpen : undefined}
								onMouseLeave={narrow ? actions.onOverlayClose : undefined}
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
		</>
	);
}
