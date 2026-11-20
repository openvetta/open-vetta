import type { PluginUiApi } from "@vetta-org/plugin-sdk";
import { CANVAS_TAB_ID } from "../tab-ids";

/**
 * 以拉满的宽度翻开画布标签卡。
 *
 * `openActivityTab` 的 `width` 只在标签卡首次 attach 时生效，而画布 Tab 通常早被
 * `setActivityTabVisible` 亮出来了，那次请求会被丢掉：面板先按旧宽度滑出，等滑完
 * 画布挂载、自己再要一次 max，整块又猛地拉宽——体感上是半路「蹲一下」。所以先写
 * 宽度再开面板，两次写入落在同一帧里，面板一步就以最终宽度滑出来。
 */
export function openCanvasTab(
	ui: Pick<PluginUiApi, "openActivityTab" | "setActivityPanelWidth">,
	cwd?: string,
): void {
	ui.setActivityPanelWidth("max");
	ui.openActivityTab(CANVAS_TAB_ID, cwd ? { width: "max", cwd } : { width: "max" });
}
