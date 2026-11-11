import { Button } from "@vetta-org/ui/button";
import { forwardRef, type ComponentPropsWithoutRef, type JSX } from "react";

function cn(...parts: Array<string | false | null | undefined>): string {
	return parts.filter(Boolean).join(" ");
}

export interface AddProjectMenuTriggerViewProps extends ComponentPropsWithoutRef<"button"> {
	label: string;
	open: boolean;
	variant: "icon" | "navItem" | "primary" | "secondary";
}

// 作为 PopoverTrigger asChild 的子节点：需要转发 ref 并透传 Radix 注入的属性。
export const AddProjectMenuTriggerView = forwardRef<HTMLButtonElement, AddProjectMenuTriggerViewProps>(
	function AddProjectMenuTriggerView({ label, open, variant, ...props }, ref): JSX.Element {
	if (variant === "secondary") {
		return (
			<Button variant="secondary" size="lg" className="no-drag w-full text-[13px]" ref={ref}
{...props}>
				<span className="icon-[solar--add-folder-linear] h-4 w-4 shrink-0" />
				{label}
			</Button>
		);
	}

	if (variant === "navItem") {
		return (
			<button
				type="button"
				title={label}
				ref={ref}
{...props}
				className={cn(
					"no-drag flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
					open ? "bg-accent text-foreground" : "text-foreground hover:bg-accent",
				)}
			>
				<span className="icon-[solar--add-linear] h-4 w-4 shrink-0" />
				{label}
			</button>
		);
	}

	return (
		<button
			type="button"
			title={label}
			ref={ref}
{...props}
			className={cn(
				"flex items-center justify-center rounded-md p-1.5 text-foreground transition-opacity hover:bg-accent",
				open ? "opacity-100" : "opacity-0 group-hover:opacity-60 group-hover:hover:opacity-100",
			)}
		>
			<span className="icon-[solar--add-linear] h-4 w-4" />
		</button>
	);
},
);
