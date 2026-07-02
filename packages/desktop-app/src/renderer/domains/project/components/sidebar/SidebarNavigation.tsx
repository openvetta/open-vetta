import { motion } from "motion/react";
import type { RefCallback } from "react";
import type { NavIndicatorBounds, SidebarNavItem } from "./types";
import { SidebarNavItemButton } from "./SidebarNavItemButton";

interface SidebarNavigationProps {
	indicatorBounds: NavIndicatorBounds | null;
	items: SidebarNavItem[];
	onItemClick: (item: SidebarNavItem) => void;
	setItemRef: (index: number) => RefCallback<HTMLButtonElement>;
}

export function SidebarNavigation({
	indicatorBounds,
	items,
	onItemClick,
	setItemRef,
}: SidebarNavigationProps): JSX.Element {
	return (
		<nav className="relative flex flex-col gap-0.5 px-1.5 pb-2 pt-2">
			{indicatorBounds && (
				<motion.span
					className="pointer-events-none absolute z-10 rounded-md bg-primary/15"
					initial={false}
					animate={{
						left: indicatorBounds.left,
						top: indicatorBounds.top,
						width: indicatorBounds.width,
						height: indicatorBounds.height,
					}}
					transition={{ type: "spring", stiffness: 430, damping: 28, mass: 0.75 }}
				/>
			)}
			{items.map((item, index) => (
				<SidebarNavItemButton
					item={item}
					key={item.key}
					onClick={() => onItemClick(item)}
					ref={setItemRef(index)}
				/>
			))}
		</nav>
	);
}
