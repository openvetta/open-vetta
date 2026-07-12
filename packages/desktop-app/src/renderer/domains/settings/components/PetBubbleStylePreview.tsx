import type { Button } from "@shared/components/ui/button";
type HostButton = typeof Button;
export type { HostButton as _HostPrimitiveHoldButton };
import { PetBubbleFrame } from "@shared/components/pet/PetBubbleFrame";
import { cn } from "@shared/lib/utils";
import type { PetBubbleStyleId } from "../../../../shared/pet-bubbles";

export function PetBubbleStylePreview({
	decorUrl,
	description,
	disabled,
	label,
	onSelect,
	selected,
	styleId,
}: {
	decorUrl: string | undefined;
	description: string;
	disabled: boolean;
	label: string;
	onSelect: (styleId: PetBubbleStyleId) => void;
	selected: boolean;
	styleId: PetBubbleStyleId;
}): JSX.Element {
	return (
		<button
			aria-label={label}
			aria-pressed={selected}
			className={cn(
				"overflow-hidden rounded-lg border border-border bg-background text-left transition-colors",
				"hover:border-primary/40 hover:bg-card/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
				"disabled:cursor-not-allowed disabled:opacity-60",
				selected && "border-primary/40 bg-primary/10 ring-1 ring-inset ring-primary/30",
			)}
			disabled={disabled}
			onClick={() => onSelect(styleId)}
			type="button"
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
		</button>
	);
}
