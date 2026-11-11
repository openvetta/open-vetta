import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export type { ClassValue };

export function cn(...parts: ClassValue[]): string {
	return twMerge(clsx(parts));
}

/**
 * 所有弹出层（Dialog、Drawer、Splash、确认框等）蒙层的统一样式：淡色压暗 + 模糊背景。
 * 新增弹出层请直接用它，不要再各写一套，否则不同弹窗的蒙层会越长越分叉。
 *
 * 其中的 `overlay-backdrop` 是给全局样式用的标记类：macOS 经典侧边栏为透出原生毛玻璃而
 * 半透明，backdrop-filter 模糊出来的结果也是半透明的，会盖不住底下清晰的文字；styles.css
 * 在有蒙层时把侧边栏临时换成实色，见 `:has(.overlay-backdrop)` 那条规则。
 */
export const OVERLAY_BACKDROP_CLASS = "overlay-backdrop bg-black/20 backdrop-blur-md";
