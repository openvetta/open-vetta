/**
 * 设计里是不是自己写了状态栏组件（文件名含 StatusBar）。
 *
 * 引擎自带的 @vetta/ios StatusBar 挖孔是独立元素，交互模式的手机外壳可以只把它藏掉；
 * 设计手写的状态栏（常见是一张带灵动岛的 PNG）灵动岛画在图里，拆不开，只能反过来让
 * 外壳别画自己的灵动岛。宿主要据此决定藏哪一边，所以由页面内探测后回报。
 *
 * 靠源码插桩的 data-vetd-source（`components/StatusBar.tsx:5`）识别：引擎自带组件不在设计
 * 源码里，不会被误判。
 */
const CUSTOM_STATUS_BAR = '[data-vetd-source*="StatusBar" i]';

export function hasCustomStatusBar(root: ParentNode = document): boolean {
	return root.querySelector(CUSTOM_STATUS_BAR) !== null;
}

/** 开始监视，状态变化（含首次）时回调；返回停止函数。DOM 变动用 rAF 合并。 */
export function watchCustomStatusBar(onChange: (custom: boolean) => void): () => void {
	let last: boolean | null = null;
	let frame = 0;
	const check = (): void => {
		frame = 0;
		const now = hasCustomStatusBar();
		if (now === last) return;
		last = now;
		onChange(now);
	};
	const schedule = (): void => {
		if (!frame) frame = requestAnimationFrame(check);
	};
	const observer = new MutationObserver(schedule);
	observer.observe(document.documentElement, { childList: true, subtree: true });
	schedule();
	return () => {
		observer.disconnect();
		if (frame) cancelAnimationFrame(frame);
	};
}
