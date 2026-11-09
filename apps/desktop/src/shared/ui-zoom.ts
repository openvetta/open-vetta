// 界面缩放（设置 → 外观 → 界面大小）。主进程持久化并应用，renderer 只读写同一个比例。

export const UI_ZOOM_MIN = 0.7;
export const UI_ZOOM_MAX = 1.5;
export const UI_ZOOM_STEP = 0.05;
export const UI_ZOOM_DEFAULT = 1;

/** 以 5% 为步长吸附并夹到 [MIN, MAX]；非有限数回落默认值。取整避免 0.1+0.2 式浮点漂移累积到配置里。 */
export function normalizeUiZoomFactor(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return UI_ZOOM_DEFAULT;
	const snapped = Math.round(value / UI_ZOOM_STEP) * UI_ZOOM_STEP;
	const clamped = Math.min(UI_ZOOM_MAX, Math.max(UI_ZOOM_MIN, snapped));
	return Math.round(clamped * 100) / 100;
}

/** 在当前比例上走 `direction` 个步长（快捷键用）。 */
export function stepUiZoomFactor(current: number, direction: 1 | -1): number {
	return normalizeUiZoomFactor(current + direction * UI_ZOOM_STEP);
}
