import type { ReactNode } from "react";
import { CornerImageFrame, type CornerImageFrameDecoration } from "@shared/components/CornerImageFrame";
import { ResizeHandle } from "@shared/components/ResizeHandle";

interface SidebarPanelProps {
	children: ReactNode;
	decoration?: CornerImageFrameDecoration;
	imageUrl?: string;
	onResize: (delta: number) => void;
	onResizeEnd: () => void;
	width: number;
}

export function SidebarPanel({
	children,
	decoration,
	imageUrl,
	onResize,
	onResizeEnd,
	width,
}: SidebarPanelProps): JSX.Element {
	return (
		<CornerImageFrame
			className="sidebar-surface relative h-full shrink-0 overflow-hidden rounded-[10px] border border-border bg-muted"
			contentClassName="flex h-full flex-col"
			decoration={decoration}
			imageUrl={imageUrl}
			style={{ width }}
		>
			{children}
			<ResizeHandle side="right" onResize={onResize} onResizeEnd={onResizeEnd} />
		</CornerImageFrame>
	);
}
