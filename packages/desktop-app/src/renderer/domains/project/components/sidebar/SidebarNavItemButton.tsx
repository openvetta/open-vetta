import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import type { SidebarNavItem } from "./types";

interface SidebarNavItemButtonProps {
	item: SidebarNavItem;
	onClick: () => void;
}

export const SidebarNavItemButton = forwardRef<HTMLButtonElement, SidebarNavItemButtonProps>(
	function SidebarNavItemButton({ item, onClick }, ref): JSX.Element {
		const { t } = useTranslation("project");

		return (
			<button
				ref={ref}
				type="button"
				onClick={onClick}
				title={item.titleLabelKey ? t(item.titleLabelKey) : undefined}
				className={`no-drag relative z-20 flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors ${
					item.active
						? "font-semibold text-foreground"
						: "text-foreground hover:bg-accent/50"
				}`}
			>
				<span className={`${item.icon} relative z-10 h-4 w-4 shrink-0`} />
				<span className="relative z-10">{t(item.labelKey)}</span>
				{item.badge && (
					<span className="relative z-10 rounded-full border border-primary/40 px-1.5 py-px text-[9px] font-semibold uppercase leading-tight tracking-wide text-primary">
						{item.badge}
					</span>
				)}
			</button>
		);
	},
);
