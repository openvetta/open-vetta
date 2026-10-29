import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * 与画布右上角按钮（CanvasCornerActions）同一套胶囊：全圆角 + 边框 + 文字标签。
 *
 * 基础类刻意不带 shrink-0：路由胶囊、路径、页面下拉要能收缩截断，按钮自己再加 shrink-0。
 *
 * 配色就是画布那几颗按钮的：宿主的 popover / border / foreground，不再按舞台底色另算。
 */
export const CAPSULE_CLASS =
	"flex h-8 items-center justify-center gap-1.5 rounded-full border border-border bg-popover text-xs font-medium text-foreground transition-colors";

/**
 * 合进一个大胶囊里的按钮：没有自己的边框和底色，只在悬停时高亮。
 * 一组连续的动作（后退 / 前进 / 刷新 / 首页）要看起来是一个整体，不要一颗一颗地分开。
 */
export const PLAIN_CLASS =
	"flex h-7 items-center justify-center gap-1.5 rounded-full text-xs font-medium text-foreground transition-colors";

/** 悬停高亮：取当前文字色的一小撮，亮暗底都适用。 */
const PLAIN_HOVER = "hover:bg-[color-mix(in_srgb,currentColor_10%,transparent)]";

interface CapsuleButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className"> {
	label: string;
	/** `plain`：用在大胶囊里面，不画自己的边框和底色。 */
	variant?: "capsule" | "plain";
	icon: ReactNode;
	/** 只画图标（窄面板）：名字留在悬停提示和无障碍标签里。 */
	iconOnly?: boolean;
}

export function CapsuleButton({ label, icon, iconOnly = false, variant = "capsule", title, ...rest }: CapsuleButtonProps) {
	const className =
		variant === "plain"
			? `${PLAIN_CLASS} shrink-0 ${PLAIN_HOVER} disabled:opacity-40 disabled:hover:bg-transparent ${iconOnly ? "w-7" : "px-2.5"}`
			: `${CAPSULE_CLASS} shrink-0 hover:opacity-80 disabled:opacity-40 disabled:hover:opacity-40 ${iconOnly ? "w-8" : "px-3"}`;
	return (
		<button
			type="button"
			title={title ?? label}
			aria-label={label}
			className={className}
			{...rest}
		>
			<svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
				{icon}
			</svg>
			{iconOnly ? null : <span className="whitespace-nowrap">{label}</span>}
		</button>
	);
}
