import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40",
	{
		variants: {
			variant: {
				default:
					"bg-[var(--surface-raised)] text-[var(--text-1)] border border-[var(--border-strong)] hover:bg-[var(--surface-overlay)]",
				primary:
					"bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]",
				outline:
					"border border-[var(--border-strong)] bg-transparent text-[var(--text-1)] hover:bg-[var(--hover-strong)]",
				ghost:
					"bg-transparent text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-[var(--text-1)]",
			},
			size: {
				sm: "h-7 px-3 text-[12px]",
				md: "h-8 px-4 text-[13px]",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "md",
		},
	},
);

export interface ButtonProps
	extends ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps): JSX.Element {
	return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
