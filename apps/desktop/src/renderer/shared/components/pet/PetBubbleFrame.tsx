import type { ReactNode } from "react";
import { PET_BUBBLE_SURFACE } from "../../../../shared/pet-bubbles";

export function PetBubbleFrame({ children }: { children: ReactNode }): JSX.Element {
	return (
		<div className={PET_BUBBLE_SURFACE.bodyClassName}>
			<div className={PET_BUBBLE_SURFACE.textClassName}>{children}</div>
		</div>
	);
}
