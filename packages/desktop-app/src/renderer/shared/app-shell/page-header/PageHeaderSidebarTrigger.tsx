import { forwardRef } from "react";
import { cn } from "@shared/lib/utils";
import type { PageHeaderSidebarTriggerProps } from "./types";

export const PageHeaderSidebarTrigger = forwardRef<HTMLButtonElement, PageHeaderSidebarTriggerProps>(
	function PageHeaderSidebarTrigger({ className, iconClassName, ...props }, ref): JSX.Element {
		return (
			<button
				ref={ref}
				type="button"
				className={cn(
					"flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
					className,
				)}
				{...props}
			>
				<span className={cn("icon-[solar--sidebar-minimalistic-linear] h-4 w-4", iconClassName)} />
			</button>
		);
	},
);
