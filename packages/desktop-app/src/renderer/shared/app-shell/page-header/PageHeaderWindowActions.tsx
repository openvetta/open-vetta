import type { ReactNode } from "react";
import { WindowControls } from "@shared/app-shell/window-controls";
import { isMac } from "@shared/lib/platform";
import { PageHeaderActionGroup } from "./PageHeaderActionGroup";

export interface PageHeaderWindowActionsProps {
	children?: ReactNode;
	className?: string;
}

export function PageHeaderWindowActions({ children, className }: PageHeaderWindowActionsProps): JSX.Element {
	return (
		<PageHeaderActionGroup className={className}>
			{children}
			{!isMac && <WindowControls />}
		</PageHeaderActionGroup>
	);
}
