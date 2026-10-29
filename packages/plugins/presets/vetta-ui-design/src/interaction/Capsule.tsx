import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * 与画布右上角按钮（CanvasCornerActions）同一套胶囊：全圆角 + 边框 + 文字标签。
 *
 * 配色走 `--vetd-pill` / `--vetd-line` / `--vetd-ink`（由交互舞台的底色算出，见 stage.ts），
 * 取不到时回落宿主的 popover / border / foreground，也就是画布上那几颗按钮的颜色。
 */
export const CAPSULE_CLASS =
	"flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full border border-[color:var(--vetd-line,var(--border))] bg-[var(--vetd-pill,var(--popover))] text-xs font-medium text-[color:var(--vetd-ink,var(--foreground))] transition-colors";

interface CapsuleButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className"> {
	label: string;
	icon: ReactNode;
	/** 只画图标（窄面板）：名字留在悬停提示和无障碍标签里。 */
	iconOnly?: boolean;
}

export function CapsuleButton({ label, icon, iconOnly = false, title, ...rest }: CapsuleButtonProps) {
	return (
		<button
			type="button"
			title={title ?? label}
			aria-label={label}
			className={`${CAPSULE_CLASS} hover:opacity-80 disabled:opacity-40 disabled:hover:opacity-40 ${iconOnly ? "w-8" : "px-3"}`}
			{...rest}
		>
			<svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
				{icon}
			</svg>
			{iconOnly ? null : <span className="whitespace-nowrap">{label}</span>}
		</button>
	);
}
