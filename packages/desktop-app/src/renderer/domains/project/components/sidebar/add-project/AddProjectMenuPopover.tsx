import { AnimatePresence, motion } from "motion/react";
import { cn } from "@shared/lib/utils";
import { AddProjectMenuItem } from "./AddProjectMenuItem";
import type { AddProjectMenuItemModel, AddProjectMenuProps } from "./types";

interface AddProjectMenuPopoverProps {
	items: AddProjectMenuItemModel[];
	open: boolean;
	variant: NonNullable<AddProjectMenuProps["variant"]>;
}

export function AddProjectMenuPopover({
	items,
	open,
	variant,
}: AddProjectMenuPopoverProps): JSX.Element {
	return (
		<AnimatePresence>
			{open && (
				<motion.div
					initial={{ opacity: 0, scale: 0.95, y: -4 }}
					animate={{ opacity: 1, scale: 1, y: 0 }}
					exit={{ opacity: 0, scale: 0.95, y: -4 }}
					transition={{ duration: 0.12 }}
					className={cn(
						"absolute z-50 mt-1 w-[150px] overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-xl",
						variant === "navItem" ? "left-0 top-full" : "right-0 top-full",
					)}
				>
					{items.map((item) => (
						<AddProjectMenuItem item={item} key={item.action} />
					))}
				</motion.div>
			)}
		</AnimatePresence>
	);
}
