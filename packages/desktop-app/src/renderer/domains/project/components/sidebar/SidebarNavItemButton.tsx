import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@shared/lib/utils";
import type { SidebarNavItem } from "./types";

export interface SidebarNavItemButtonProps extends Omit<ComponentPropsWithoutRef<"button">, "children"> {
	classNames?: {
		badge?: string;
		icon?: string;
		label?: string;
	};
	item: SidebarNavItem;
}

export const SidebarNavItemButton = forwardRef<HTMLButtonElement, SidebarNavItemButtonProps>(
	function SidebarNavItemButton({ className, classNames, item, onClick, ...props }, ref): JSX.Element {
		const { t } = useTranslation("project");

		return (
			<button
				ref={ref}
				type="button"
				onClick={onClick}
				title={item.titleLabelKey ? t(item.titleLabelKey) : undefined}
				className={cn(
					"no-drag relative z-20 flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
					item.active ? "font-semibold text-foreground" : "text-foreground hover:bg-accent/50",
					className,
				)}
				{...props}
			>
				<span className={cn(item.icon, "relative z-10 h-4 w-4 shrink-0", classNames?.icon)} />
				<span className={cn("relative z-10", classNames?.label)}>{t(item.labelKey)}</span>
				{item.badge && (
					<span
						className={cn(
							"relative z-10 rounded-full border border-primary/40 px-1.5 py-px text-[9px] font-semibold uppercase leading-tight tracking-wide text-primary",
							classNames?.badge,
						)}
					>
						{item.badge}
					</span>
				)}
			</button>
		);
	},
);
