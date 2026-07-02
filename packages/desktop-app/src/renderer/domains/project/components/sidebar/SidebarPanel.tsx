import type { ReactNode } from "react";
import { ResizeHandle } from "@shared/components/ResizeHandle";
import { ThemeSurface } from "@shared/theme/appearance";
import { cn } from "@shared/lib/utils";

interface SidebarPanelProps {
	children: ReactNode;
	className?: string;
	contentClassName?: string;
	onResize: (delta: number) => void;
	onResizeEnd: () => void;
	width: number;
}

export function SidebarPanel({
	children,
	className,
	contentClassName,
	onResize,
	onResizeEnd,
	width,
}: SidebarPanelProps): JSX.Element {
	return (
		<div
			className={cn(
				"sidebar-surface relative h-full shrink-0 rounded-[10px] border border-border bg-muted",
				className,
			)}
			data-theme-surface-root="sidebar.panel"
			style={{ width }}
		>
			<ThemeSurface slot="sidebar.panel" />
			<div
				className={cn(
					"relative z-10 flex h-full flex-col overflow-hidden rounded-[inherit]",
					contentClassName,
				)}
			>
				{children}
			</div>
			<ResizeHandle side="right" onResize={onResize} onResizeEnd={onResizeEnd} />
		</div>
	);
}
