import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
	{
		variants: {
			variant: {
				default: "bg-zinc-900 text-white hover:bg-zinc-800",
				outline: "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50",
				ghost: "bg-transparent text-zinc-700 hover:bg-zinc-100",
			},
			size: {
				sm: "h-8 px-3",
				md: "h-9 px-4",
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
