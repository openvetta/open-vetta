import { cn } from "@vetta-org/ui/utils";
import { forwardRef, type ComponentPropsWithoutRef, type JSX } from "react";

export interface SidebarSectionActionButtonProps extends Omit<ComponentPropsWithoutRef<"button">, "children"> {
	/** iconify class，例如 `icon-[solar--add-linear]`。 */
	iconClassName: string;
	/** 可访问名称，同时作为悬停提示。 */
	label: string;
	/**
	 * `hover`：只在所在 `group` 被悬停时出现；`always`：常驻显示。
	 * 两者都在自身悬停时提到全亮。
	 */
	reveal?: "hover" | "always";
	/** 关联的菜单或弹层正打开，保持全亮；作为菜单触发器（`aria-haspopup="menu"`）时同步为 `aria-expanded`。 */
	expanded?: boolean;
}

/**
 * 侧栏分区标题行（项目、对话）右侧的图标按钮。
 * 需要作为 Popover/Dropdown 的 `asChild` 触发器时会被注入 ref 与事件，故原样转发。
 */
export const SidebarSectionActionButton = forwardRef<HTMLButtonElement, SidebarSectionActionButtonProps>(
	function SidebarSectionActionButton(
		{ className, expanded = false, iconClassName, label, reveal = "hover", type = "button", ...props },
		ref,
	): JSX.Element {
		return (
			<button
				ref={ref}
				type={type}
				title={label}
				aria-label={label}
				aria-expanded={props["aria-haspopup"] === "menu" ? expanded : undefined}
				data-state={expanded ? "open" : "closed"}
				className={cn(
					// 键盘聚焦时也要可见，不能只靠悬停才露出。
					"flex items-center justify-center rounded-md p-1.5 text-foreground transition-opacity hover:bg-accent focus-visible:opacity-100",
					expanded
						? "opacity-100"
						: reveal === "always"
							? "opacity-60 hover:opacity-100"
							: "opacity-0 group-hover:opacity-60 group-hover:hover:opacity-100",
					className,
				)}
				{...props}
			>
				<span aria-hidden="true" className={cn(iconClassName, "h-4 w-4")} />
			</button>
		);
	},
);
