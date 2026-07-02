import type { ReactNode } from "react";
import { WindowControls } from "@shared/app-shell/window-controls";
import { isMac } from "@shared/lib/platform";
import { cn } from "@shared/lib/utils";

export interface PageHeaderWindowActionsProps {
	children?: ReactNode;
	className?: string;
}

export function PageHeaderWindowActions({ children, className }: PageHeaderWindowActionsProps): JSX.Element {
	return (
		<div className={cn("no-drag flex shrink-0 items-center gap-1", className)}>
			{children}
			{!isMac && <WindowControls />}
		</div>
	);
}
