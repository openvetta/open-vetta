import type { ComponentPropsWithoutRef, JSX, ReactNode } from "react";
import { cn } from "@vetta/ui";

export interface AppFrameProps extends ComponentPropsWithoutRef<"div"> {
	children: ReactNode;
	contentClassName?: string;
}

export function AppFrame({
	children,
	className,
	contentClassName,
	...props
}: AppFrameProps): JSX.Element {
	return (
		<div
			className={cn("flex h-screen w-screen flex-col overflow-hidden bg-background", className)}
			{...props}
		>
			<div className={cn("relative flex flex-1 gap-2 overflow-visible p-2", contentClassName)}>
				{children}
			</div>
		</div>
	);
}
