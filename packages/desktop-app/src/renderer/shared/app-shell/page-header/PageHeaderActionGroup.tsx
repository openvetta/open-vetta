import type { ReactNode } from "react";
import { cn } from "@shared/lib/utils";

export interface PageHeaderActionGroupProps {
	children?: ReactNode;
	className?: string;
}

export function PageHeaderActionGroup({ children, className }: PageHeaderActionGroupProps): JSX.Element {
	return (
		<div className={cn("no-drag flex shrink-0 items-center gap-1", className)}>
			{children}
		</div>
	);
}
