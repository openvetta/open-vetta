import * as React from "react";
import { cn } from "./utils";

/**
 * 通用按钮组：一颗半透明的胶囊，里面并排若干个操作按钮，按钮之间用一条细竖线分隔。
 * 用于悬浮在内容之上的工具条（如详情页右上角的操作区），不要拿它做表单里的普通按钮。
 *
 * 用法：`<ButtonGroup><ButtonGroupItem icon={…} title="运行" /><ButtonGroupItem icon={…} label="提交" badge={3} /></ButtonGroup>`。
 * 需要多组并排时，外面套一层 flex + gap 即可，每组各自成胶囊。
 *
 * 外观：浅色 / 深色都用「前景色 + 低透明度」叠出玻璃感，所以放在任何背景上都成立。
 * 模糊只给 `blur` 属性开启（默认开）；容器本身已经半透明，贴在纯色背景上时可以关掉，省一层合成。
 */

export interface ButtonGroupProps extends React.ComponentProps<"div"> {
	/** 是否给胶囊加背景模糊，默认开。贴在纯色背景上没有可模糊的内容时可关。 */
	blur?: boolean;
}

function ButtonGroup({ className, blur = true, children, ...props }: ButtonGroupProps) {
	return (
		<div
			role="group"
			data-slot="button-group"
			className={cn(
				"inline-flex items-center rounded-full p-0.5",
				"bg-foreground/[0.06]",
				"dark:bg-white/[0.08]",
				blur && "backdrop-blur-md backdrop-saturate-150",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}

export interface ButtonGroupItemProps extends Omit<React.ComponentProps<"button">, "children"> {
	/** 图标节点，建议直接传 lucide 图标，尺寸由组件统一成 16px。 */
	icon?: React.ReactNode;
	/** 图标右侧的文字。不传则是纯图标按钮；纯图标按钮请务必传 `title` 或 `aria-label`。 */
	label?: React.ReactNode;
	/**
	 * 角标：数字显示计数（超过 99 显示 `99+`，0 或 undefined 不显示）；`true` 显示一枚小红点；
	 * 也可传任意节点自定义内容。
	 */
	badge?: number | boolean | React.ReactNode;
	/** 选中态（如面板已打开）：底色加深。 */
	active?: boolean;
}

function renderBadge(badge: ButtonGroupItemProps["badge"]): React.ReactNode {
	if (badge === undefined || badge === null || badge === false || badge === 0) return null;
	if (badge === true) {
		return (
			<span
				data-slot="button-group-badge"
				className="absolute top-1 right-1 size-1.5 rounded-full bg-red-500 ring-2 ring-[color-mix(in_srgb,var(--background)_70%,transparent)]"
			/>
		);
	}
	const text = typeof badge === "number" ? (badge > 99 ? "99+" : String(badge)) : badge;
	return (
		<span
			data-slot="button-group-badge"
			className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] leading-none font-semibold text-white tabular-nums"
		>
			{text}
		</span>
	);
}

function ButtonGroupItem({
	className,
	icon,
	label,
	badge,
	active = false,
	type = "button",
	...props
}: ButtonGroupItemProps) {
	const hasLabel = label !== undefined && label !== null && label !== false;
	return (
		<button
			type={type}
			data-slot="button-group-item"
			data-active={active || undefined}
			aria-pressed={props["aria-pressed"] ?? (active ? true : undefined)}
			className={cn(
				"relative inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium whitespace-nowrap",
				"text-foreground transition-colors outline-none select-none",
				"hover:bg-foreground/[0.07] hover:text-foreground active:translate-y-px",
				"focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-40",
				"data-[active]:bg-foreground/[0.1] data-[active]:text-foreground",
				"[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				hasLabel ? "px-3" : "w-8",
				// 相邻两项之间的细分隔线；画在后一项的左缘，不占布局宽度。
				"not-first:before:pointer-events-none not-first:before:absolute not-first:before:top-1/2 not-first:before:-left-px not-first:before:h-3.5 not-first:before:w-px not-first:before:-translate-y-1/2 not-first:before:bg-foreground/15",
				// 选中项的底色会贴着分隔线：它自己的左线和右邻项的左线一起隐藏，避免线与底色连成一片。
				"data-[active]:before:opacity-0 [[data-active]+&]:before:opacity-0",
				className,
			)}
			{...props}
		>
			{icon}
			{hasLabel && <span>{label}</span>}
			{renderBadge(badge)}
		</button>
	);
}

export { ButtonGroup, ButtonGroupItem };
