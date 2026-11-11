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
					// icon 触发器贴在侧栏右缘，向下展开会跑到按钮内侧；改在按钮右侧展开，
					// alignOffset 取按钮高度（p-1.5 + h-4 = 28px），让菜单顶部对齐按钮底部。
					side={variant === "icon" ? "right" : "bottom"}
					align="start"
					alignOffset={variant === "icon" ? 28 : 0}
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
