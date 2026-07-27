import { motion, useReducedMotion } from "motion/react";
import {
	createContext,
	useContext,
	useId,
	useMemo,
	useRef,
	type ComponentPropsWithoutRef,
	type JSX,
	type ReactNode,
} from "react";

/** DESIGN.md §5.1：进入 opacity + y，duration ≤ 0.5s；stagger 0.04~0.06。 */
export const SETTINGS_ENTER_EASE = [0.16, 1, 0.3, 1] as const;
export const SETTINGS_ENTER_DURATION = 0.36;
export const SETTINGS_ENTER_STAGGER = 0.05;
export const SETTINGS_ENTER_DELAY_CHILDREN = 0.04;

interface SettingsEnterContextValue {
	/** 按稳定 id 领取 delay；同 id 重复调用返回同一值（兼容 Strict Mode）。 */
	delayFor: (id: string) => number;
}

const SettingsEnterContext = createContext<SettingsEnterContextValue | null>(null);

/**
 * Tab 级入场作用域：切换设置侧栏 tab 时用 key 重挂载，子元素通过
 * `SettingsEnterItem` / `useSettingsEnterDelay` 领取递增 delay。
 */
export function SettingsTabEnter({
	children,
	className,
}: {
	readonly children: ReactNode;
	readonly className?: string;
}): JSX.Element {
	const orderRef = useRef(new Map<string, number>());
	const value = useMemo<SettingsEnterContextValue>(
		() => ({
			delayFor: (id: string) => {
				const existing = orderRef.current.get(id);
				if (existing !== undefined) return existing;
				const delay = SETTINGS_ENTER_DELAY_CHILDREN + orderRef.current.size * SETTINGS_ENTER_STAGGER;
				orderRef.current.set(id, delay);
				return delay;
			},
		}),
		[],
	);

	return (
		<SettingsEnterContext.Provider value={value}>
			<div className={className}>{children}</div>
		</SettingsEnterContext.Provider>
	);
}

/** 在 SettingsTabEnter 内领取 delay；域外返回 0（仍可自带动画）。 */
export function useSettingsEnterDelay(): number {
	const ctx = useContext(SettingsEnterContext);
	const id = useId();
	return ctx?.delayFor(id) ?? 0;
}

export type SettingsEnterItemProps = Omit<
	ComponentPropsWithoutRef<typeof motion.div>,
	"initial" | "animate" | "transition"
> & {
	readonly children: ReactNode;
};

/**
 * 设置页块级入场：opacity 0→1 + y 8→0。
 * 放在标题、SettingSection、列表卡等「视觉块」上；同一 tab 内自动 stagger。
 */
export function SettingsEnterItem({
	children,
	className,
	...props
}: SettingsEnterItemProps): JSX.Element {
	const delay = useSettingsEnterDelay();
	const reduceMotion = useReducedMotion();

	if (reduceMotion) {
		return (
			<div className={className} data-settings-enter-item="" {...(props as ComponentPropsWithoutRef<"div">)}>
				{children}
			</div>
		);
	}

	return (
		<motion.div
			className={className}
			data-settings-enter-item=""
			{...props}
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{
				duration: SETTINGS_ENTER_DURATION,
				delay,
				ease: SETTINGS_ENTER_EASE,
			}}
		>
			{children}
		</motion.div>
	);
}
