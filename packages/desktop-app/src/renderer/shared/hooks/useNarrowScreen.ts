import { useEffect, useState } from "react";

// 低于此宽度判定为「窄屏」：侧边栏从挤压布局切换为悬浮覆盖。
// 估算依据：侧边栏默认 220 + 间距/内边距 ~28 + 主内容最小 320 ≈ 568，留余量取 640。
export const SIDEBAR_NARROW_BREAKPOINT = 640;

/** 监听窗口宽度，返回是否处于窄屏（宽度 < 阈值）。 */
export function useNarrowScreen(): boolean {
	const [narrow, setNarrow] = useState(() => window.innerWidth < SIDEBAR_NARROW_BREAKPOINT);
	useEffect(() => {
		const onResize = (): void => setNarrow(window.innerWidth < SIDEBAR_NARROW_BREAKPOINT);
		onResize();
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);
	return narrow;
}
