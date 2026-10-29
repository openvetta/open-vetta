import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

/**
 * Frame Menu：单独选中的 frame 左侧外部、与顶边对齐的一列胶囊按钮（主题色，图标 +
 * 文字）。frame 级的操作都放这里，按钮由画布决定（FrameView 只管摆）。
 */
export interface FrameMenuItem {
	key: string;
	icon: ReactNode;
	label: string;
	/** 悬停提示：按钮上的文字放不下的完整说明。 */
	hint?: string;
	/**
	 * hero：菜单的核心动作（让 Vetta 去做），做成更大的两行胶囊——图标托在圆片里，
	 * 主文案下面一行 caption 说清它作用在谁身上。一列里最多一个，放第一位。
	 */
	variant?: "hero";
	caption?: string;
	/** 它点开的浮层此刻开着（按钮呈按下态）。 */
	active?: boolean;
	onSelect(): void;
}

interface FrameMenuProps {
	items: readonly FrameMenuItem[];
	/**
	 * 按钮下方的浮层挂载点（追问输入框经 portal 挂进来，见 SelectionAskBadge）。
	 * 挂在菜单里，浮层就紧贴着点开它的按钮，而且跟菜单一起反向缩放。
	 */
	onSlot(element: HTMLElement | null): void;
}

/** 按下不能冒泡到画布：那边会当成点了空白处，清掉选中、起一个框选。 */
function stopPointer(event: ReactPointerEvent): void {
	event.stopPropagation();
}

export function FrameMenu({ items, onSlot }: FrameMenuProps) {
	return (
		<div
			// z-40：菜单伸在 frame 左边，DOM 上排在后面的 frame 不能把它（和下面的浮层）盖住。
			className="absolute top-0 z-40 flex flex-col items-end gap-1.5"
			data-vetd-frame-menu=""
			style={{
				right: "100%",
				transform: "scale(var(--vetd-lscale, 1))",
				transformOrigin: "right top",
				marginRight: "calc(8px * var(--vetd-lscale, 1))",
			}}
		>
			{items.map((item) =>
				item.variant === "hero" ? (
					<button
						key={item.key}
						type="button"
						aria-expanded={item.active}
						className={`flex items-center gap-2 whitespace-nowrap rounded-full bg-primary py-1.5 pr-4 pl-1.5 text-primary-foreground shadow-md transition-[opacity,box-shadow] hover:opacity-95 ${
							item.active ? "ring-4 ring-primary/30" : "ring-4 ring-primary/15"
						}`}
						title={item.hint ?? item.label}
						onPointerDown={stopPointer}
						onClick={item.onSelect}
					>
						<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-foreground/20 [&>svg]:size-3.5">
							{item.icon}
						</span>
						<span className="flex min-w-0 flex-col items-start leading-tight">
							<span className="text-[13px] font-semibold">{item.label}</span>
							{item.caption ? (
								<span className="max-w-[12rem] truncate text-[10px] font-medium opacity-80">{item.caption}</span>
							) : null}
						</span>
					</button>
				) : (
					<button
						key={item.key}
						type="button"
						className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
						title={item.hint ?? item.label}
						onPointerDown={stopPointer}
						onClick={item.onSelect}
					>
						{item.icon}
						{item.label}
					</button>
				),
			)}
			<div ref={onSlot} data-vetd-frame-menu-slot="" />
		</div>
	);
}

const iconProps = {
	viewBox: "0 0 24 24",
	className: "size-3.5",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 2,
	strokeLinecap: "round",
	strokeLinejoin: "round",
	"aria-hidden": true,
} as const;

export const frameMenuIcons = {
	expand: (
		<svg {...iconProps}>
			<path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
		</svg>
	),
	collapse: (
		<svg {...iconProps}>
			<path d="m7 20 5-5 5 5M7 4l5 5 5-5" />
		</svg>
	),
};
