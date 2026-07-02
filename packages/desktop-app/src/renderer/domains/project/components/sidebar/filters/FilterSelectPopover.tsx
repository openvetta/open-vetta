import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/components/ui/popover";
import { cn } from "@shared/lib/utils";
import type { DefaultConversationFilterOption, SidebarFilterOption } from "./types";

interface FilterSelectPopoverProps<TValue extends string> {
	current: SidebarFilterOption | DefaultConversationFilterOption;
	options: readonly (SidebarFilterOption | DefaultConversationFilterOption)[];
	onChange: (value: TValue) => void;
	showGridIcon?: boolean;
	value: TValue;
}

export function FilterSelectPopover<TValue extends string>({
	current,
	options,
	onChange,
	showGridIcon = false,
	value,
}: FilterSelectPopoverProps<TValue>): JSX.Element {
	const { t } = useTranslation("project");
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"no-drag flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium transition-colors",
						open
							? "bg-accent text-foreground"
							: "text-muted-foreground/80 hover:bg-accent hover:text-foreground",
					)}
				>
					{showGridIcon && <span className="icon-[solar--widget-4-linear] h-3.5 w-3.5 shrink-0" />}
					<span>{t(current.labelKey)}</span>
					<span className="icon-[solar--alt-arrow-down-linear] h-3 w-3" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				side="bottom"
				align="start"
				sideOffset={4}
				className="w-[140px] gap-0 overflow-hidden rounded-lg border border-border p-1"
			>
				{options.map((option) => (
					<button
						key={option.value}
						type="button"
						onClick={() => {
							onChange(option.value as TValue);
							setOpen(false);
						}}
						className={cn(
							"flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium transition-colors",
							value === option.value
								? "bg-primary text-primary-foreground"
								: "text-foreground hover:bg-accent",
						)}
					>
						<span>{t(option.labelKey)}</span>
						{value === option.value && (
							<span className="icon-[solar--check-circle-linear] ml-auto h-3.5 w-3.5" />
						)}
					</button>
				))}
			</PopoverContent>
		</Popover>
	);
}
