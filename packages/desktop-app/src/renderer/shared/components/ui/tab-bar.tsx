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
 * 浏览器/文件夹式选项卡：页签悬浮在内容卡片上方，激活页签为圆角凸起、
 * 底色与卡片一致并向下延伸 1px 盖住卡片描边，与卡片无缝融合；
 * 非激活页签为半透明灰色圆角块。
 *
 * 须与带 1px `border-border` 边框的内容卡片紧贴配套使用（见 ActivityPanel），
 * 激活页签的左/右/上边框会与卡片边框接成一条连续轮廓。
 */
export function TabBar<T extends string>({
	items,
	value,
	onChange,
	className,
	suppressLayoutAnimation = false,
}: TabBarProps<T>): JSX.Element {
	const layoutId = useId();
	const activeIndex = items.findIndex((item) => item.key === value);

	return (
		<div className={cn("relative z-10 flex shrink-0 items-end px-3", className)}>
			{items.map(({ key, label, icon, badge }, index) => {
				const active = value === key;
				// 紧贴激活页签的两侧邻居去掉靠近激活侧的顶部圆角，避免与凸起的激活页签之间出现缺口
				const cornerClass = active
					? "rounded-t-lg"
					: index === activeIndex - 1
						? "rounded-tl-lg"
						: index === activeIndex + 1
							? "rounded-tr-lg"
							: "rounded-t-lg";
				return (
					<button
						key={key}
						type="button"
						onClick={() => onChange(key)}
						className={cn(
							"relative flex select-none items-center gap-1.5 whitespace-nowrap text-[11px] font-medium leading-none transition-all duration-150",
							cornerClass,
							active
								? "h-[34px] px-4 text-foreground"
								: "h-[30px] bg-black/[0.045] px-3.5 text-muted-foreground hover:bg-black/[0.07] hover:text-foreground/80 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]",
						)}
					>
						{active && (
							<motion.span
								layoutId={`tabbar-active-${layoutId}`}
								className="absolute inset-x-0 top-0 -bottom-px rounded-t-lg border border-b-0 border-border bg-card"
								transition={
									suppressLayoutAnimation
										? { duration: 0 }
										: { type: "spring", stiffness: 480, damping: 36, mass: 0.8 }
								}
							/>
						)}
						<span className="relative z-10 flex items-center gap-1.5">
							{icon && (
								<span
									className={cn(icon, "h-3.5 w-3.5 shrink-0", active ? "text-primary" : "opacity-70")}
								/>
							)}
							{label}
							{badge && badge > 0 ? (
								<span className="inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold leading-none text-white">
									{badge > 99 ? "99+" : badge}
								</span>
							) : null}
						</span>
					</button>
				);
			})}
		</div>
	);
}
