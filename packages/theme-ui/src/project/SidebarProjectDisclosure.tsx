import { cn } from "@vetta-org/ui/utils";
import type { JSX, ReactNode } from "react";
import { SIDEBAR_SECTION_TRIGGER_CLASS, SidebarSectionTriggerLabel } from "../sidebar/SidebarSectionTriggerLabel";

interface SidebarProjectDisclosureTriggerProps {
	className?: string;
	contentId: string;
	label: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function SidebarProjectDisclosureTrigger({
	className,
	contentId,
	label,
	open,
	onOpenChange,
}: SidebarProjectDisclosureTriggerProps): JSX.Element {
	return (
		<button
			type="button"
			aria-expanded={open}
			aria-controls={contentId}
			className={cn(SIDEBAR_SECTION_TRIGGER_CLASS, className)}
			onClick={(event) => {
				event.currentTarget.focus();
				onOpenChange(!open);
			}}
		>
			<SidebarSectionTriggerLabel label={label} open={open} />
		</button>
	);
}

export function SidebarProjectDisclosureContent({
	children,
	id,
	open,
}: {
	children: ReactNode;
	id: string;
	open: boolean;
}): JSX.Element {
	return (
		// Commit the scroll layout once and keep the column within the sidebar width.
		<div className={cn("grid grid-cols-1", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
			<div id={id} inert={!open} aria-hidden={!open} className="min-h-0 overflow-clip">
				<div
					className={cn(
						"transition-[translate,opacity] duration-150 ease-out motion-reduce:transition-none",
						open ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
					)}
				>
					{children}
				</div>
			</div>
		</div>
	);
}
