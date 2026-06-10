import { motion } from "motion/react";
import { useId } from "react";
import { cn } from "../../lib/utils";

export interface TabBarItem<T extends string> {
	key: T;
	label: string;
	icon?: string;
	/** 可选未读小红点（>0 显示） */
	badge?: number;
}

interface TabBarProps<T extends string> {
	items: TabBarItem<T>[];
	value: T;
	onChange: (value: T) => void;
	className?: string;
	/** 容器尺寸正在变化时设为 true，禁用指示器的 layout 动画，避免抖动 */
	suppressLayoutAnimation?: boolean;
}

/**
 * VSCode 编辑器标签页风格的 tab 栏：扁平选项卡贴顶排列，
 * 激活项与下方内容区融为一体（底边框断开）+ 顶部滑动高亮线，
 * 非激活项底色略深、hover 提亮。
 */
export function TabBar<T extends string>({
	items,
	value,
	onChange,
	className,
	suppressLayoutAnimation = false,
}: TabBarProps<T>): JSX.Element {
	const layoutId = useId();

	return (
		<div className={cn("flex shrink-0 items-stretch overflow-x-auto", className)}>
			{items.map(({ key, label, icon, badge }) => {
				const active = value === key;
				return (
					<button
						key={key}
						type="button"
						onClick={() => onChange(key)}
						className={cn(
							"relative flex h-[34px] select-none items-center gap-1.5 whitespace-nowrap border-b border-r border-border/60 px-3 text-[11px] font-medium leading-none transition-colors duration-150",
							active
								? "border-b-transparent text-foreground"
								: "bg-black/[0.035] text-muted-foreground hover:text-foreground/80 dark:bg-white/[0.04]",
						)}
					>
						{active && (
							<motion.span
								layoutId={`tabbar-indicator-${layoutId}`}
								className="absolute inset-x-0 -top-px h-[2px] bg-primary"
								transition={
									suppressLayoutAnimation
										? { duration: 0 }
										: { type: "spring", stiffness: 480, damping: 36, mass: 0.8 }
								}
							/>
						)}
						{icon && (
							<span className={cn(icon, "h-3.5 w-3.5 shrink-0", active ? "text-primary" : "opacity-70")} />
						)}
						{label}
						{badge && badge > 0 ? (
							<span className="inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold leading-none text-white">
								{badge > 99 ? "99+" : badge}
							</span>
						) : null}
					</button>
				);
			})}
			{/* 末尾占位：补齐底边框 + 延续 tab 栏底色，让激活 tab 形成 VSCode 式缺口 */}
			<div className="min-w-4 flex-1 border-b border-border/60 bg-black/[0.035] dark:bg-white/[0.04]" />
		</div>
	);
}
