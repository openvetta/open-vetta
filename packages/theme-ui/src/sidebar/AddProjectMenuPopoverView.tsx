import { PopoverContent } from "@vetta-org/ui/popover";
import { AnimatePresence, motion } from "motion/react";
import type { JSX } from "react";
import { AddProjectMenuItem } from "./AddProjectMenuItem";

export interface AddProjectMenuPopoverItem {
	action: string;
	icon: string;
	label: string;
	onSelect: () => void;
}

export interface AddProjectMenuPopoverViewProps {
	items: AddProjectMenuPopoverItem[];
	open: boolean;
	variant: "icon" | "navItem" | "primary" | "secondary";
}

/** 须渲染在 Popover 内。外观与底部设置菜单（SettingsMenuPopover）保持一致。 */
export function AddProjectMenuPopoverView({
	items,
	open,
	variant,
}: AddProjectMenuPopoverViewProps): JSX.Element {
	return (
		<AnimatePresence>
			{open && (
				<PopoverContent
					forceMount
					asChild
					side="bottom"
					align={variant === "icon" ? "end" : "start"}
					sideOffset={6}
					// 按内容撑开而不是写死宽度：菜单项文案随语言变化，写死会把较长的项截断。
					className="w-max min-w-[150px] gap-0 overflow-hidden rounded-lg border border-border p-1"
					style={{ animation: "none" }}
				>
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.12, ease: "easeOut" }}
					>
						{items.map((item) => (
							<AddProjectMenuItem
								key={item.action}
								icon={item.icon}
								label={item.label}
								onSelect={item.onSelect}
							/>
						))}
					</motion.div>
				</PopoverContent>
			)}
		</AnimatePresence>
	);
}
