/**
 * 发丝线宽度。Chromium 会把 CSS 里的 `1px` 边框向下取整到整数个设备像素，而 `1px` 的
 * 偏移量不取整：页面放大到非整数倍（⌘+ 到 110% 之类）时，两者就差零点几个设备像素，
 * 需要和边框精确对齐的拼接处（例如输入卡片与上方的命令面板）会错开一个像素。
 *
 * 这里算出边框实际占的 CSS 宽度，写成 `--hairline`，偏移量用它代替写死的 1px。
 * `devicePixelRatio` 已经包含页面缩放，所以放大后会跟着变。
 */
export function hairlineWidth(devicePixelRatio: number): number {
	if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) return 1;
	// 小于 1 个设备像素时浏览器按 1 个设备像素画，不会再取整到 0。
	return Math.max(1, Math.floor(devicePixelRatio)) / devicePixelRatio;
}

export function installHairlineVariable(): void {
	const apply = (): void => {
		document.documentElement.style.setProperty("--hairline", `${hairlineWidth(window.devicePixelRatio)}px`);
	};
	apply();
	// 页面缩放与跨屏拖动都会触发 resize，并改变 devicePixelRatio。
	window.addEventListener("resize", apply);
}
