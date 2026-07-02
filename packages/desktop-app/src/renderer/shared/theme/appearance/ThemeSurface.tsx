import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { CornerImageFrame } from "@shared/components/CornerImageFrame";
import { cn } from "@shared/lib/utils";
import { useThemeSurface } from "./context";
import type { ThemeSurfaceSlot } from "./types";

interface ThemeSurfaceProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
	children: ReactNode;
	contentClassName?: string;
	slot: ThemeSurfaceSlot;
}

export function ThemeSurface({
	children,
	className,
	contentClassName,
	slot,
	...props
}: ThemeSurfaceProps): JSX.Element {
	const surface = useThemeSurface(slot);
	const surfaceClassName = cn(className, surface?.surfaceClassName);
	const surfaceContentClassName = cn(contentClassName, surface?.contentClassName);

	if (surface?.frame?.kind === "corner-image") {
		return (
			<CornerImageFrame
				className={surfaceClassName}
				contentClassName={surfaceContentClassName}
				decoration={surface.frame.decoration}
				data-theme-surface={slot}
				imageUrl={surface.frame.imageUrl}
				{...props}
			>
				{children}
			</CornerImageFrame>
		);
	}

	return (
		<div
			className={surfaceClassName}
			data-theme-surface={slot}
			{...props}
		>
			{surfaceContentClassName ? (
				<div className={surfaceContentClassName}>{children}</div>
			) : (
				children
			)}
		</div>
	);
}
