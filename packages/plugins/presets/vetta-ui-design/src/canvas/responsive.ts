import { type RefObject, useEffect, useState } from "react";

/**
 * 画布浮层的响应式档位。
 *
 * 画布活在活动面板里，宽度随用户拖分栏任意变化（窄到三百多像素很常见），所以依据是
 * **画布容器的宽度**，不是窗口宽度，也就不能用 Tailwind 的 `sm:` 之类视口断点。
 * 档位是离散的：宽度连续变化时只有跨过阈值才会重渲染，拖分栏不会让整张画布每帧重渲。
 */

/** 底部工具栏：full 带放大和缩放加减；compact 收掉加减、关放大；tight 再窄就横向可滚动。 */
export type DockDensity = "full" | "compact" | "tight";
/** 右上角按钮组：full 带文字；icons 版本历史和导出只留图标；minimal 连运行也只留图标。 */
export type CornerDensity = "full" | "icons" | "minimal";

export interface CanvasDensity {
	dock: DockDensity;
	corner: CornerDensity;
}

/** 完整底部工具栏（含放大余量）大约 490px 宽，再加两侧各 12px 的边距。 */
const DOCK_FULL_MIN = 560;
/** 紧凑档（无缩放加减、图标 30px）约 370px。 */
const DOCK_COMPACT_MIN = 400;
/** 右上角三个胶囊带文字约 280px，加左上角标题（最宽 208px）和边距。 */
const CORNER_FULL_MIN = 760;
const CORNER_ICONS_MIN = 480;

export function densityOf(width: number): CanvasDensity {
	return {
		dock: width >= DOCK_FULL_MIN ? "full" : width >= DOCK_COMPACT_MIN ? "compact" : "tight",
		corner: width >= CORNER_FULL_MIN ? "full" : width >= CORNER_ICONS_MIN ? "icons" : "minimal",
	};
}

/** 右上角按钮组（含最右端的设计 / 交互开关）在各档下的大致占宽（px），左上角标题据此留出让位的空间。 */
export const CORNER_RESERVE: Record<CornerDensity, number> = { full: 400, icons: 290, minimal: 240 };

/** 底部预设面板窄于这个宽度，分类 tab 收成下拉（5 个 tab + 横竖屏开关大约 560px）。 */
export const PANEL_NARROW_BELOW = 640;

/**
 * 订阅元素宽度并换算成档位：`pick` 把像素映射成离散值，只有档位变了才触发重渲染。
 * 没有 ResizeObserver 的环境（测试）一直用 `initial`。
 */
export function useWidthLevel<T>(ref: RefObject<HTMLElement | null>, pick: (width: number) => T, initial: T): T {
	const [level, setLevel] = useState<T>(initial);
	// biome-ignore lint/correctness/useExhaustiveDependencies: pick 是模块级纯函数，换引用不该重建观察者
	useEffect(() => {
		const element = ref.current;
		if (!element || typeof ResizeObserver === "undefined") return;
		const apply = (width: number): void => {
			if (width <= 0) return;
			const next = pick(width);
			setLevel((current) => (Object.is(current, next) || JSON.stringify(current) === JSON.stringify(next) ? current : next));
		};
		apply(element.getBoundingClientRect().width);
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) apply(entry.contentRect.width);
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, [ref]);
	return level;
}
