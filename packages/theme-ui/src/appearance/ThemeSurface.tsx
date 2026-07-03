import type { ComponentPropsWithoutRef, JSX } from "react";
import { useThemeSurface, type ThemeSurfaceSlot } from "@vetta/theme-sdk/appearance";
import { cn } from "@vetta/ui";
import { CornerImageDecoration } from "./CornerImageFrame";
import { NineSliceImageDecoration } from "./NineSliceImageFrame";

export interface ThemeSurfaceProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
	slot: ThemeSurfaceSlot;
}

export function ThemeSurface({
	className,
	slot,
	...props
}: ThemeSurfaceProps): JSX.Element {
	const surface = useThemeSurface(slot);

	if (surface?.frame?.kind === "corner-image") {
		return (
			<div
				aria-hidden="true"
				className={cn("pointer-events-none absolute inset-0 z-0 overflow-visible", className, surface.surfaceClassName)}
				data-theme-surface={slot}
				{...props}
			>
				<CornerImageDecoration
					decoration={surface.frame.decoration}
					imageUrl={surface.frame.imageUrl}
				/>
			</div>
		);
	}

	if (surface?.frame?.kind === "nine-slice-image") {
		return (
			<div
				aria-hidden="true"
				className={cn("pointer-events-none absolute inset-0 z-0 overflow-visible", className, surface.surfaceClassName)}
				data-theme-surface={slot}
				{...props}
			>
				<NineSliceImageDecoration
					decoration={surface.frame.decoration}
					imageUrl={surface.frame.imageUrl}
				/>
			</div>
		);
	}

	return (
		<div
			className={cn("pointer-events-none absolute inset-0 z-0", className, surface?.surfaceClassName)}
			data-theme-surface={slot}
			{...props}
		/>
	);
}
