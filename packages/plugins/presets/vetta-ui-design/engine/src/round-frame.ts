/**
 * 画框圆角大到多少算「圆角画框」。
 *
 * 圆角画框在画布 / 交互视图里是靠外层 `border-radius` 裁出来的，而页面里的
 * `backdrop-filter`（Tailwind 的 backdrop-blur）输出不受这层圆角裁剪，会在四角漏出一块
 * 方形的模糊色。设备屏幕圆角（40 以上）漏得明显，画布默认的 12px 圆角几乎看不出来，
 * 为了不白白丢掉毛玻璃效果，只在超过这个阈值时才关掉。
 */
export const ROUND_FRAME_MIN_RADIUS = 24;

export function isRoundFrame(radius: unknown): boolean {
	return typeof radius === "number" && radius >= ROUND_FRAME_MIN_RADIUS;
}
