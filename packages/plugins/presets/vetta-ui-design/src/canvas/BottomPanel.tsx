import type { ReactNode } from "react";

/** 面板高度固定：底部工具栏抬升的距离据此推算，两边的动画才能同步。 */
export const BOTTOM_PANEL_HEIGHT = 196;
/** 面板与它上面的工具栏之间留的间距。 */
const BOTTOM_PANEL_GAP = 8;
/** 面板开着时底部工具栏要抬高多少。 */
export const BOTTOM_PANEL_LIFT = BOTTOM_PANEL_HEIGHT + BOTTOM_PANEL_GAP;

/** 工具栏跟面板用同一条缓动，一起升降才不会错开。 */
export const BOTTOM_PANEL_TRANSITION = "transform 360ms cubic-bezier(0.22, 1, 0.36, 1), opacity 240ms ease";

interface BottomPanelProps {
	open: boolean;
	label: string;
	children: ReactNode;
}

/**
 * 设计面板的通用底部扩展面板：某个画布工具需要一块比浮层更大的操作区时，从底部伸起
 * 一块通栏圆角面板（四周留外边距），底部工具栏同时被它顶高（见 ControlBar 的 lift）。
 * 以后各工具的扩展面板都挂在这里，这个壳只管位置、动效和不吃画布手势。
 *
 * 不裁剪溢出：面板里的下拉菜单要朝上伸出面板之外（卡片行自己有横向滚动）。
 *
 * 收起时内容仍然挂着（为了让收起动画有东西可看），靠 inert 让它不可聚焦、不可点。
 */
export function BottomPanel({ open, label, children }: BottomPanelProps) {
	return (
		<section
			aria-label={label}
			aria-hidden={!open}
			inert={!open}
			data-vetd-bottom-panel=""
			className="pointer-events-auto absolute right-3 bottom-3 left-3 z-30 rounded-2xl border border-border/80 bg-popover shadow-lg"
			style={{
				height: BOTTOM_PANEL_HEIGHT,
				transform: open ? "translateY(0)" : `translateY(calc(100% + 24px))`,
				opacity: open ? 1 : 0,
				transition: BOTTOM_PANEL_TRANSITION,
				// 收起后的位置在视口外，pointer-events 交给 inert 管；这里不再多加一层。
			}}
			// 同底部工具栏：不截断的话画布根会在 pointerdown 时捕获指针，面板里的按钮点不动。
			onPointerDown={(event) => event.stopPropagation()}
			onPointerMove={(event) => event.stopPropagation()}
			onPointerUp={(event) => event.stopPropagation()}
			onWheel={(event) => event.stopPropagation()}
		>
			{children}
		</section>
	);
}
