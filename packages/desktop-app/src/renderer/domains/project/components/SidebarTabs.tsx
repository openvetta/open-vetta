import { useState } from "react";
import { useAtom } from "jotai";
import {
	defaultConversationFilterAtom,
	sidebarFilterAtom,
	type DefaultConversationFilter,
	type SidebarFilter,
} from "@shared/store/atoms";
import { Popover, PopoverTrigger, PopoverContent } from "@shared/components/ui/popover";
import { cn } from "@shared/lib/utils";

const FILTER_OPTIONS: { value: SidebarFilter; label: string }[] = [
	{ value: "all", label: "全部" },
	{ value: "normal", label: "普通" },
	{ value: "batch", label: "批量任务" },
	{ value: "flowing", label: "流转" },
];

export function SidebarFilterSelect(): JSX.Element {
	const [filter, setFilter] = useAtom(sidebarFilterAtom);
	const [open, setOpen] = useState(false);
	const current = FILTER_OPTIONS.find((o) => o.value === filter) ?? FILTER_OPTIONS[0];

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
					<span className="icon-[solar--widget-linear] h-3.5 w-3.5 shrink-0" />
					<span>{current.label}</span>
					<span className="icon-[solar--alt-arrow-down-linear] h-3 w-3" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				side="bottom"
				align="start"
				sideOffset={4}
				className="w-[140px] gap-0 overflow-hidden rounded-lg border border-border p-1"
			>
				{FILTER_OPTIONS.map((opt) => (
					<button
						key={opt.value}
						type="button"
						onClick={() => {
							setFilter(opt.value);
							setOpen(false);
						}}
						className={cn(
							"flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium transition-colors",
							filter === opt.value
								? "bg-primary text-primary-foreground"
								: "text-foreground hover:bg-accent",
						)}
					>
						<span>{opt.label}</span>
						{filter === opt.value && (
							<span className="icon-[solar--check-circle-linear] ml-auto h-3.5 w-3.5" />
						)}
					</button>
				))}
			</PopoverContent>
		</Popover>
	);
}

const DEFAULT_CONVERSATION_FILTER_OPTIONS: { value: DefaultConversationFilter; label: string }[] = [
	{ value: "conversation", label: "对话" },
	{ value: "claw", label: "Claw" },
];

export function DefaultConversationFilterSelect(): JSX.Element {
	const [filter, setFilter] = useAtom(defaultConversationFilterAtom);
	const [open, setOpen] = useState(false);
	const current =
		DEFAULT_CONVERSATION_FILTER_OPTIONS.find((o) => o.value === filter) ??
		DEFAULT_CONVERSATION_FILTER_OPTIONS[0];

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
					<span>{current.label}</span>
					<span className="icon-[solar--alt-arrow-down-linear] h-3 w-3" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				side="bottom"
				align="start"
				sideOffset={4}
				className="w-[140px] gap-0 overflow-hidden rounded-lg border border-border p-1"
			>
				{DEFAULT_CONVERSATION_FILTER_OPTIONS.map((opt) => (
					<button
						key={opt.value}
						type="button"
						onClick={() => {
							setFilter(opt.value);
							setOpen(false);
						}}
						className={cn(
							"flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium transition-colors",
							filter === opt.value
								? "bg-primary text-primary-foreground"
								: "text-foreground hover:bg-accent",
						)}
					>
						<span>{opt.label}</span>
						{filter === opt.value && (
							<span className="icon-[solar--check-circle-linear] ml-auto h-3.5 w-3.5" />
						)}
					</button>
				))}
			</PopoverContent>
		</Popover>
	);
}
