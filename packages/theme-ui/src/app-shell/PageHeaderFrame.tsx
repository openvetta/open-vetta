import type { ComponentPropsWithoutRef, JSX, ReactNode } from "react";
import { ThemeSurface } from "../appearance/ThemeSurface";
import { isMac } from "../utils/platform";
import { cn } from "@vetta/ui";

export interface PageHeaderFrameProps extends ComponentPropsWithoutRef<"div"> {
	children: ReactNode;
	contentClassName?: string;
	reserveMacTrafficLights?: boolean;
	triggerVisible?: boolean;
}

export function PageHeaderFrame({
	children,
	className,
	contentClassName,
	reserveMacTrafficLights = true,
	style,
	triggerVisible = false,
	...props
}: PageHeaderFrameProps): JSX.Element {
	return (
		<div
			className={cn(
				"drag-region relative flex h-11 shrink-0 items-center justify-between gap-2 overflow-visible",
				!isMac && "h-8",
				className,
			)}
			data-theme-surface-root="app.pageHeader"
			style={{
				paddingLeft: reserveMacTrafficLights && isMac && triggerVisible ? 78 : 12,
				paddingRight: reserveMacTrafficLights && isMac ? 12 : 0,
				marginBottom: isMac ? 0 : 10,
				...style,
			}}
			{...props}
		>
			<ThemeSurface slot="app.pageHeader" />
			<div className={cn("relative z-10 flex min-w-0 flex-1 items-center justify-between gap-2", contentClassName)}>
				{children}
			</div>
		</div>
	);
}
