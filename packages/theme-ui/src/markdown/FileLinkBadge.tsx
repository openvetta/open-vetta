import { useState } from "react";
import type { JSX, MouseEvent, ReactNode } from "react";
import { ContextMenuView } from "../shared/ContextMenuView";
import type { ContextMenuNode } from "../shared/ContextMenuView";

export interface FileLinkMenuLabels {
	open: string;
	/** 平台相关：macOS「在访达中显示」，Windows「在资源管理器中显示」。 */
	reveal: string;
}

export interface FileLinkBadgeProps {
	path: string;
	className: string;
	children: ReactNode;
	menuLabels?: FileLinkMenuLabels;
	onOpen: (path: string) => void;
	/** 宿主能在本机文件管理器里定位该文件时才传；不传则右键保持浏览器默认行为。 */
	onReveal?: (path: string) => void;
}

/** 消息里的文件徽标：左键在应用内预览，右键菜单可在系统文件管理器中定位。 */
export function FileLinkBadge({
	path,
	className,
	children,
	menuLabels,
	onOpen,
	onReveal,
}: FileLinkBadgeProps): JSX.Element {
	const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
	const canReveal = onReveal !== undefined && menuLabels !== undefined;

	const handleContextMenu = (event: MouseEvent<HTMLButtonElement>): void => {
		if (!canReveal) return;
		// 有选中文字时让会话的「复制 / 加入输入框」菜单接手。
		const selection = window.getSelection();
		if (selection && !selection.isCollapsed) return;
		event.preventDefault();
		event.stopPropagation();
		setMenu({ x: event.clientX, y: event.clientY });
	};

	const items: ContextMenuNode[] = canReveal
		? [
				{
					kind: "item",
					id: "open",
					label: menuLabels.open,
					iconClassName: "icon-[solar--eye-linear]",
					onSelect: () => onOpen(path),
				},
				{
					kind: "item",
					id: "reveal",
					label: menuLabels.reveal,
					iconClassName: "icon-[solar--folder-open-linear]",
					onSelect: () => onReveal(path),
				},
			]
		: [];

	return (
		<>
			<button
				type="button"
				title={path}
				className={className}
				onClick={() => onOpen(path)}
				onContextMenu={handleContextMenu}
			>
				{children}
			</button>
			{menu ? <ContextMenuView items={items} x={menu.x} y={menu.y} onClose={() => setMenu(null)} /> : null}
		</>
	);
}
