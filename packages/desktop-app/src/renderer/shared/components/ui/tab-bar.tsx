import { motion } from "motion/react";
import { useId } from "react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface TabBarItem<T extends string> {
	key: T;
	label: string;
	/** string 视为 iconify class；其余按 React 节点渲染（插件 tab 自带 icon） */
	icon?: ReactNode;
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
 * 浏览器/文件夹式选项卡：页签悬浮在内容卡片上方。相邻页签以负边距互相重叠、靠
 * z-index 分层，形成卡片堆叠的层次感（越靠近激活页签层级越高，向激活页签汇聚叠
 * 压）。激活页签层级最高、圆角凸起、底色与卡片一致并向下延伸 1px 盖住卡片描边，
 * 与卡片无缝融合并带顶部投影抬升；非激活页签为下沉的半透明圆角块、带细描边。
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
				// 激活页签置顶；非激活页签越靠近激活页签层级越高，向激活页签方向叠压
				const zIndex = active ? items.length + 1 : items.length - Math.abs(index - activeIndex);
				return (
					<motion.button
						key={key}
						type="button"
						layout
						style={{ zIndex }}
						transition={
							suppressLayoutAnimation
								? { duration: 0 }
								: { type: "spring", stiffness: 480, damping: 36, mass: 0.8 }
						}
						onClick={() => onChange(key)}
						className={cn(
							"relative flex select-none items-center gap-1.5 whitespace-nowrap rounded-t-lg text-[11px] font-medium leading-none transition-[color,background-color] duration-150",
							index > 0 && "-ml-2",
							active
								? "h-[29px] px-4 text-foreground"
								: "h-[23px] border border-b-0 border-border/70 bg-muted px-4 text-muted-foreground hover:brightness-110 hover:text-foreground/80 dark:bg-[#22242e]",
						)}
					>
						{active && (
							<motion.span
								layoutId={`tabbar-active-${layoutId}`}
								className="absolute inset-x-0 top-0 -bottom-px rounded-t-lg border border-b-0 border-border bg-muted shadow-[0_-2px_6px_rgba(0,0,0,0.08)]"
								transition={
									suppressLayoutAnimation
										? { duration: 0 }
										: { type: "spring", stiffness: 480, damping: 36, mass: 0.8 }
								}
							/>
						)}
						<span className="relative z-10 flex items-center gap-1.5">
							{icon != null &&
								(typeof icon === "string" ? (
									<span
										className={cn(icon, "h-3.5 w-3.5 shrink-0", active ? "text-primary" : "opacity-70")}
									/>
								) : (
									<span
										className={cn(
											"flex h-3.5 w-3.5 shrink-0 items-center justify-center [&>svg]:h-full [&>svg]:w-full",
											active ? "text-primary" : "opacity-70",
										)}
									>
										{icon}
									</span>
								))}
							{label}
							{badge && badge > 0 ? (
								<span className="inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold leading-none text-white">
									{badge > 99 ? "99+" : badge}
								</span>
							) : null}
						</span>
					</motion.button>
				);
			})}
		</div>
	);
}
