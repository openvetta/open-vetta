// 界面缩放（设置 → 外观 → 界面大小）。主进程持久化并应用，renderer 只读写同一个比例。

/** 可选的缩放档位。滑块、Cmd/Ctrl +/- 都只在这些档位间移动。 */
export const UI_ZOOM_STEPS = [0.75, 0.9, 1, 1.1, 1.25, 1.5] as const;
export const UI_ZOOM_DEFAULT = 1;

/** 吸附到最近的档位；两档正中时取较小的。非有限数回落默认值，兼容旧配置里的任意比例。 */
export function normalizeUiZoomFactor(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return UI_ZOOM_DEFAULT;
	let nearest: number = UI_ZOOM_STEPS[0];
	for (const step of UI_ZOOM_STEPS) {
		if (Math.abs(step - value) < Math.abs(nearest - value)) nearest = step;
	}
	return nearest;
}

export function uiZoomStepIndex(factor: number): number {
	return UI_ZOOM_STEPS.indexOf(normalizeUiZoomFactor(factor) as (typeof UI_ZOOM_STEPS)[number]);
}

/** 在当前档位上走 `direction` 档（快捷键用），到头不越界。 */
export function stepUiZoomFactor(current: number, direction: 1 | -1): number {
	const next = Math.min(UI_ZOOM_STEPS.length - 1, Math.max(0, uiZoomStepIndex(current) + direction));
	return UI_ZOOM_STEPS[next] ?? UI_ZOOM_DEFAULT;
}

/** 红绿灯左缘距窗口的屏幕像素。 */
const TRAFFIC_LIGHT_X = 16;
/**
 * 原生按钮顶边 y 与其视觉中线的距离（屏幕 px）。由「页头中线 28、顶边 24」标定得到，
 * 与页头 CSS 无关：页头怎么排由渲染进程实测后上报，这里只描述按钮自身。
 */
const TRAFFIC_LIGHT_CENTER_OFFSET = 4;
/** 渲染进程还没上报实测中线时的兜底（CSS px），等于 100% 缩放下页头的标定中线。 */
export const TITLEBAR_CENTER_FALLBACK = 28;

/** 校验渲染进程上报的页头中线（CSS px）：非有限数或越界一律丢弃。 */
export function parseTitlebarCenter(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	return value >= 0 && value <= 200 ? value : undefined;
}

/**
 * 红绿灯是原生控件，不随网页缩放；页头中线是 CSS px，换算成屏幕 px 要乘缩放比。
 * 中线由渲染进程实测上报，所以页头高度、内边距、沉浸式页头怎么变，这里都不需要改数字。
 */
export function trafficLightPositionFor(centerCssPx: number, factor: number): { x: number; y: number } {
	return {
		x: TRAFFIC_LIGHT_X,
		y: Math.round(centerCssPx * normalizeUiZoomFactor(factor) - TRAFFIC_LIGHT_CENTER_OFFSET),
	};
}
