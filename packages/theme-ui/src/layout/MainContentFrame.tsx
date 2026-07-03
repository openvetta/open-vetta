import type { ComponentPropsWithoutRef, JSX, ReactNode } from "react";
import { cn } from "@vetta/ui";

export interface MainContentFrameProps extends ComponentPropsWithoutRef<"main"> {
	children: ReactNode;
	contentClassName?: string;
	header: ReactNode;
}

export function MainContentFrame({
	children,
	className,
	contentClassName,
	header,
	...props
}: MainContentFrameProps): JSX.Element {
	return (
		<main
			className={cn("relative flex min-h-0 min-w-[320px] flex-1 flex-col overflow-visible bg-transparent", className)}
			{...props}
		>
			{header}
			<div className={cn("flex min-h-0 flex-1 overflow-hidden", contentClassName)}>
				{children}
			</div>
		</main>
	);
}
