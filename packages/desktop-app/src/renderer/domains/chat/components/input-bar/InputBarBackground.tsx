import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@shared/lib/utils";

export interface InputBarBackgroundProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
	children?: ReactNode;
}

export function InputBarBackground({
	children,
	className,
	...props
}: InputBarBackgroundProps): JSX.Element {
	return (
		<div
			aria-hidden="true"
			className={cn(
				"pointer-events-none absolute inset-0 z-[1] overflow-hidden rounded-[inherit]",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}
