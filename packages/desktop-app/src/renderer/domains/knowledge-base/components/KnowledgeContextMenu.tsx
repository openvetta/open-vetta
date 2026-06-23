import { useEffect } from "react";
import { cn } from "@shared/lib/utils";

export interface ContextMenuItem {
	label: string;
	icon: string;
	danger?: boolean;
	onClick: () => void;
}

interface KnowledgeContextMenuProps {
	x: number;
	y: number;
	items: ContextMenuItem[];
	onClose: () => void;
}

/** 右键浮层菜单：fixed 定位于光标处，点外部 / Esc 关闭。 */
export function KnowledgeContextMenu({ x, y, items, onClose }: KnowledgeContextMenuProps): JSX.Element {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	return (
		<div
			className="fixed inset-0 z-[120]"
			onClick={onClose}
			onContextMenu={(e) => {
				e.preventDefault();
				onClose();
			}}
		>
			{/* 简单避让右/下边界 */}
			<div
				style={{ left: Math.min(x, window.innerWidth - 180), top: Math.min(y, window.innerHeight - 12 - items.length * 34) }}
				className="absolute min-w-40 rounded-lg border border-border bg-popover p-1 shadow-xl"
				onClick={(e) => e.stopPropagation()}
			>
				{items.map((item) => (
					<button
						key={item.label}
						type="button"
						onClick={() => {
							item.onClick();
							onClose();
						}}
						className={cn(
							"flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-[12px] transition-colors",
							item.danger
								? "text-red-600 hover:bg-red-500/10"
								: "text-foreground hover:bg-accent",
						)}
					>
						<span
							className={cn(item.icon, "h-4 w-4", item.danger ? "" : "text-muted-foreground")}
						/>
						{item.label}
					</button>
				))}
			</div>
		</div>
	);
}
