import { cn } from "@vetta-org/ui/utils";
import type { ComponentPropsWithoutRef, JSX, ReactNode } from "react";

export interface AppFrameProps extends ComponentPropsWithoutRef<"div"> {
	children: ReactNode;
	contentClassName?: string;
	decoration?: ReactNode;
	overlay?: ReactNode;
}

export function AppFrame({
	children,
	className,
	contentClassName,
	decoration,
	overlay,
	...props
}: AppFrameProps): JSX.Element {
	return (
		<div
			// hidden 仍允许 focus/scrollIntoView 滚动外框，连带抬高侧边栏；滚动只属于内部视口。
			className={cn("relative isolate flex h-screen w-screen flex-col overflow-clip bg-background", className)}
			{...props}
		>
			{decoration}
			<div
				className={cn("relative z-10 flex min-h-0 flex-1 overflow-visible p-2", contentClassName)}
				data-theme-layout="app.frameContent"
			>
				{children}
			</div>
			{overlay}
		</div>
	);
}
