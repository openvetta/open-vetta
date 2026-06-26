import { PetBubbleFrame } from "@shared/components/pet/PetBubbleFrame";
import { cn } from "@shared/lib/utils";
import type { PetBubbleStyleId } from "../../../../shared/pet-bubbles";

export function PetBubbleStylePreview({
	decorUrl,
	description,
	label,
	selected,
	styleId,
}: {
	decorUrl: string | undefined;
	description: string;
	label: string;
	selected: boolean;
	styleId: PetBubbleStyleId;
}): JSX.Element {
	return (
		<div
			className={cn(
				"overflow-hidden rounded-lg border border-border bg-background transition-colors",
				selected && "border-primary/40 bg-primary/10 ring-1 ring-inset ring-primary/30",
			)}
		>
			<div className="flex min-h-32 items-center justify-center overflow-hidden bg-muted px-8 py-10">
				<PetBubbleFrame
					decorUrl={decorUrl}
					styleId={styleId}
				>
					{label}
				</PetBubbleFrame>
			</div>
			<div className="border-t border-border px-3 py-2">
				<div className="truncate text-[12px] font-medium text-foreground">{label}</div>
				<div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{description}</div>
			</div>
		</div>
	);
}
