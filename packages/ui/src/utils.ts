import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export type { ClassValue };

export function cn(...parts: ClassValue[]): string {
	return twMerge(clsx(parts));
}

/**
 * 所有弹出层（Dialog、Drawer、Splash、确认框等）蒙层的统一样式：淡色压暗 + 模糊背景。
 * 新增弹出层请直接用它，不要再各写一套，否则不同弹窗的蒙层会越长越分叉。
 */
export const OVERLAY_BACKDROP_CLASS = "bg-black/20 backdrop-blur-md";
