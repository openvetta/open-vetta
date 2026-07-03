import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@shared/lib/utils";
import { ThemeSurface } from "@vetta/theme-ui/appearance";

export interface ActivityPanelFrameProps extends ComponentPropsWithoutRef<"div"> {
	children: ReactNode;
	contentClassName?: string;
}

export function ActivityPanelFrame({
	children,
	className,
	contentClassName,
	...props
}: ActivityPanelFrameProps): JSX.Element {
	return (
		<div
			className={cn(
				"relative z-10 flex min-h-0 flex-1 flex-col overflow-visible rounded-xl border border-border bg-muted",
				className,
			)}
			data-theme-surface-root="activity.panel"
			{...props}
		>
			<ThemeSurface slot="activity.panel" />
			<div
				className={cn(
					"relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[inherit]",
					contentClassName,
				)}
			>
				{children}
			</div>
		</div>
	);
}
