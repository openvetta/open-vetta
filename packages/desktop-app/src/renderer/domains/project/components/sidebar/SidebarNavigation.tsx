import { motion } from "motion/react";
import type { JSX, RefCallback } from "react";
import { cn } from "@shared/lib/utils";
import { useThemeComponent } from "@vetta/theme-sdk";
import { ThemeSurface } from "@vetta/theme-ui/appearance";
import type { NavIndicatorBounds, SidebarNavItem } from "./types";
import { SidebarNavItemButton } from "./SidebarNavItemButton";

export interface SidebarNavigationProps {
	className?: string;
	classNames?: {
		indicator?: string;
		item?: string;
		itemBadge?: string;
		itemIcon?: string;
		itemLabel?: string;
	};
	indicatorBounds: NavIndicatorBounds | null;
	items: readonly SidebarNavItem[];
	onItemClick: (item: SidebarNavItem) => void;
	setItemRef: (index: number) => RefCallback<HTMLButtonElement>;
}

export function SidebarNavigation({
	className,
	classNames,
	indicatorBounds,
	items,
	onItemClick,
	setItemRef,
}: SidebarNavigationProps): JSX.Element {
	const ThemeNavItemButton = useThemeComponent("sidebar.navItem", SidebarNavItemButton);

	return (
		<nav className={cn("relative flex flex-col gap-0.5 px-1.5 pb-2 pt-2", className)}>
			{indicatorBounds && (
				<motion.span
					className={cn(
						"pointer-events-none absolute z-10 overflow-visible rounded-md bg-primary/15",
						classNames?.indicator,
					)}
					initial={false}
					animate={{
						left: indicatorBounds.left,
						top: indicatorBounds.top,
						width: indicatorBounds.width,
						height: indicatorBounds.height,
					}}
					transition={{ type: "spring", stiffness: 430, damping: 28, mass: 0.75 }}
				>
					<ThemeSurface slot="sidebar.navigationIndicator" />
				</motion.span>
			)}
			{items.map((item, index) => (
				<ThemeNavItemButton
					className={classNames?.item}
					classNames={{
						badge: classNames?.itemBadge,
						icon: classNames?.itemIcon,
						label: classNames?.itemLabel,
					}}
					item={item}
					key={item.key}
					onClick={() => onItemClick(item)}
					ref={setItemRef(index)}
				/>
			))}
		</nav>
	);
}
