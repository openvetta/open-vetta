import type { JSX } from "react";

/**
 * 「有会话在等你」的角标：琥珀色小圆点里一个问号，轻微呼吸。
 *
 * 比 `RunningPulseDot` 大一号、且用琥珀色：运行中只是忙，可以等；停下来等回答才是要人动手的，
 * 余光里必须能一眼区分。呼吸用 opacity 而不是向外扩散的 ping——等待可能持续几分钟，
 * 常驻的无限扩散动画会让空闲窗口持续重绘。
 */
export function WaitingPulseBadge(): JSX.Element {
	return (
		<span
			aria-hidden="true"
			className="pointer-events-none absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold leading-none text-white motion-safe:animate-pulse"
		>
			?
		</span>
	);
}
