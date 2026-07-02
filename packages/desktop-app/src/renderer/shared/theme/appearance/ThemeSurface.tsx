import type { ComponentPropsWithoutRef } from "react";
import { CornerImageDecoration } from "@shared/components/CornerImageFrame";
import { cn } from "@shared/lib/utils";
import { useThemeSurface } from "./context";
import type { ThemeSurfaceSlot } from "./types";

interface ThemeSurfaceProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
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

	return (
		<div
			className={cn("pointer-events-none absolute inset-0 z-0", className, surface?.surfaceClassName)}
			data-theme-surface={slot}
			{...props}
		/>
	);
}
