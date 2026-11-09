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
