import { Fragment, useState, type JSX } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@vetta-org/ui/popover";
import { cn } from "@vetta-org/ui/utils";
import { SIDEBAR_SECTION_TRIGGER_CLASS, SidebarSectionTriggerLabel } from "./SidebarSectionTriggerLabel";

export interface SidebarFilterSelectOption {
	readonly value: string;
	readonly label: string;
	/** 有值时在标签前画一个该色的 Dot——标签档靠颜色辨认。 */
	readonly dotColor?: string;
	/** 在该项之前插一条分割线，用于隔开来源档与标签档。 */
	readonly separatorBefore?: boolean;
}

export interface SidebarFilterSelectViewProps {
	readonly options: readonly SidebarFilterSelectOption[];
	readonly showGridIcon?: boolean;
	readonly value: string;
	readonly onChange: (value: string) => void;
}

export function SidebarFilterSelectView({
	options,
	showGridIcon = false,
	value,
	onChange,
}: SidebarFilterSelectViewProps): JSX.Element {
	const [open, setOpen] = useState(false);
	const current = options.find((option) => option.value === value) ?? options[0];

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button type="button" className={cn("no-drag", SIDEBAR_SECTION_TRIGGER_CLASS)}>
					{showGridIcon && <span className="icon-[solar--widget-4-linear] h-4 w-4 shrink-0" />}
					{/* 选中标签档时把颜色带到收起态，否则收起后只剩一个名字，认不出是哪个标签。 */}
					{current?.dotColor ? (
						<span
							aria-hidden="true"
							className="h-2.5 w-2.5 shrink-0 rounded-full"
							style={{ backgroundColor: current.dotColor }}
						/>
					) : null}
					<SidebarSectionTriggerLabel label={current?.label ?? ""} open={open} />
				</button>
			</PopoverTrigger>
			<PopoverContent
				side="bottom"
				align="start"
				sideOffset={4}
				// Match the inner radius to the inset from the popover edge.
				className="max-h-[60vh] w-[160px] gap-0 overflow-y-auto rounded-xl p-(--sidebar-filter-inset) [--sidebar-filter-inset:--spacing(1)]"
			>
				{options.map((option) => (
					<Fragment key={option.value}>
						{option.separatorBefore ? <div className="-mx-1 my-1 h-px bg-border" /> : null}
						<button
							type="button"
							onClick={() => {
								onChange(option.value);
								setOpen(false);
							}}
							className={cn(
								"flex w-full items-center gap-2 rounded-[max(0px,calc(var(--radius-xl)_-_var(--sidebar-filter-inset)))] px-2 py-[5px] text-[12px] font-medium transition-colors",
								value === option.value
									? "bg-primary text-primary-foreground"
									: "text-foreground hover:bg-accent",
							)}
						>
							{option.dotColor ? (
								<span
									aria-hidden="true"
									className="h-2.5 w-2.5 shrink-0 rounded-full"
									style={{ backgroundColor: option.dotColor }}
								/>
							) : null}
							<span className="truncate">{option.label}</span>
							{value === option.value && (
								<span className="icon-[solar--check-circle-linear] ml-auto h-3.5 w-3.5 shrink-0" />
							)}
						</button>
					</Fragment>
				))}
			</PopoverContent>
		</Popover>
	);
}
