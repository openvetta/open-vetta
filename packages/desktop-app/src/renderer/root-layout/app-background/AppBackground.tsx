import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@shared/lib/utils";
import { ThemeSurface } from "@vetta/theme-ui/appearance";

export interface AppBackgroundProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
	children?: ReactNode;
}

export function AppBackground({
	children,
	className,
	...props
}: AppBackgroundProps): JSX.Element {
	return (
		<div
			aria-hidden="true"
			className={cn("pointer-events-none absolute inset-0 z-0 overflow-hidden", className)}
			{...props}
		>
			<ThemeSurface slot="app.frame" />
			{children}
		</div>
	);
}
