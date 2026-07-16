import type { JSX, ReactNode } from "react";
import { cn } from "@vetta/ui";
import { isMac } from "../utils/platform";

export interface SidebarTopBarClassNames {
	actions?: string;
	brand?: string;
	clawButton?: string;
	collapseButton?: string;
}

export interface SidebarTopBarLabels {
	clawConnected: string;
	hide: string;
}

export interface SidebarTopBarProps {
	/** Host-provided brand trailing content (e.g. connected SidebarUpdateButton). */
	brandTrailing?: ReactNode;
	className?: string;
	classNames?: SidebarTopBarClassNames;
	floating: boolean;
	imOnline: boolean;
	labels: SidebarTopBarLabels;
	onCollapse?: () => void;
	onOpenClawSettings: () => void;
}

export function SidebarTopBar({
	brandTrailing,
	className,
	classNames,
	floating,
	imOnline,
	labels,
	onCollapse,
	onOpenClawSettings,
}: SidebarTopBarProps): JSX.Element {
	return (
		<div
			className={cn(
				"flex h-11 shrink-0 items-center justify-between",
				!floating && "drag-region",
				className,
			)}
			style={{ paddingLeft: isMac ? 78 : 12, paddingRight: 6 }}
		>
			{isMac ? (
				<div className={cn("flex min-w-0 items-center", classNames?.brand)}>{brandTrailing}</div>
			) : (
				<div className={cn("flex min-w-0 items-center gap-2", classNames?.brand)}>
					<img
						src="./icon.png"
						alt="Vetta"
						className="h-5 w-5 shrink-0 rounded-[5px]"
					/>
					<span className="truncate text-[13px] font-semibold text-foreground">Vetta</span>
					{brandTrailing}
				</div>
			)}
			<div className={cn("flex items-center gap-1", classNames?.actions)}>
				{imOnline && (
					<button
						type="button"
						onClick={onOpenClawSettings}
						title={labels.clawConnected}
						className={cn(
							"no-drag relative flex h-5 items-center gap-1 rounded-full bg-secondary px-1.5 text-[10px] font-medium text-secondary-foreground transition-colors hover:bg-secondary/80",
							classNames?.clawButton,
						)}
					>
						<span className="relative flex h-1 w-1">
							<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary-foreground opacity-70" />
							<span className="relative inline-flex h-1 w-1 rounded-full bg-secondary-foreground" />
						</span>
						Claw
					</button>
				)}
				{onCollapse && (
					<button
						type="button"
						onClick={onCollapse}
						title={labels.hide}
						className={cn(
							"no-drag flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
							classNames?.collapseButton,
						)}
					>
						<span className="icon-[solar--sidebar-minimalistic-linear] h-4 w-4" />
					</button>
				)}
			</div>
		</div>
	);
}
