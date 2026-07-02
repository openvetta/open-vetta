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
		<ThemeSurface
			slot="sidebar.panel"
			className={cn(
				"sidebar-surface relative h-full shrink-0 overflow-hidden rounded-[10px] border border-border bg-muted",
				className,
			)}
			contentClassName={cn("flex h-full flex-col", contentClassName)}
			style={{ width }}
		>
			{children}
			<ResizeHandle side="right" onResize={onResize} onResizeEnd={onResizeEnd} />
		</ThemeSurface>
	);
}
