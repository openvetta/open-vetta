import type { JSX } from "react";
import { cn } from "@vetta/ui";

export interface SettingsAiAssistButtonViewProps {
	readonly label: string;
	readonly className?: string;
	readonly onClick: () => void;
}

/**
 * AI-assist CTA. Class names mirror host Button outline+sm (zero-diff intent).
 * Host Dialog remains outside this control.
 */
export function SettingsAiAssistButtonView({
	label,
	className,
	onClick,
}: SettingsAiAssistButtonViewProps): JSX.Element {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"group/button inline-flex shrink-0 items-center justify-center gap-1 rounded-[min(var(--radius-md),12px)] border border-border bg-transparent bg-clip-padding px-2.5 h-7 text-[0.8rem] font-medium whitespace-nowrap text-foreground transition-all outline-none select-none hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				"shrink-0",
				className,
			)}
		>
			<span className="icon-[mdi--robot-outline] h-3.5 w-3.5" />
			{label}
		</button>
	);
}
