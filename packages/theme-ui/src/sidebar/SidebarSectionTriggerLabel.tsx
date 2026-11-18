import { cn } from "@vetta-org/ui/utils";
import type { JSX } from "react";

export const SIDEBAR_SECTION_TRIGGER_CLASS =
	"group/section-trigger inline-flex min-w-0 cursor-pointer items-center gap-1 rounded-md py-1 pl-2.5 pr-2 text-start text-[13px] font-medium text-foreground focus-visible:outline-1 focus-visible:outline-ring focus-visible:outline-offset-[-1px]";

export function SidebarSectionTriggerLabel({ label, open }: { label: string; open: boolean }): JSX.Element {
	return (
		<>
			<span className="truncate group-hover/section-trigger:opacity-70">{label}</span>
			<span
				aria-hidden="true"
				className={cn(
					"size-3 shrink-0",
					open ? "icon-[solar--alt-arrow-down-linear]" : "icon-[solar--alt-arrow-right-linear]",
				)}
			/>
		</>
	);
}
