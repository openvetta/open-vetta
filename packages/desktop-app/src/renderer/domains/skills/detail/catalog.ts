/**
 * 内置能力详情 catalog：结构固定，正文走 i18n（capabilities.detail.catalog.<id>）。
 * 仅声明式 JSON 呈现，不是官方可执行 UI 轨。
 *
 * icon class 写在 TS 中，便于 UnoCSS/iconify 扫描（勿只放 locales JSON）。
 */

import type { ShowcaseCanvasMotif, ShowcaseTemplateId } from "./types";

export type CapabilityCatalogId = "figma" | "github" | "notion";

/** capability item id → catalog id */
const CONNECTOR_CATALOG: Record<string, CapabilityCatalogId> = {
	"connector:figma": "figma",
	"connector:github": "github",
	"connector:notion": "notion",
};

/** 各 catalog 适用场景的 icon（与 i18n scenarios 数组顺序对齐） */
export const CATALOG_SCENARIO_ICONS: Record<CapabilityCatalogId, readonly string[]> = {
	figma: [
		"icon-[solar--document-text-linear]",
		"icon-[solar--ruler-pen-linear]",
		"icon-[solar--code-linear]",
		"icon-[solar--users-group-rounded-linear]",
	],
	github: [
		"icon-[solar--code-square-linear]",
		"icon-[solar--bug-linear]",
		"icon-[solar--chat-round-line-linear]",
		"icon-[solar--document-add-linear]",
	],
	notion: [
		"icon-[solar--notebook-linear]",
		"icon-[solar--checklist-linear]",
		"icon-[solar--document-text-linear]",
		"icon-[solar--folder-with-files-linear]",
	],
};

/** catalog → 呈现模板（宿主实现，非图片） */
export const CATALOG_SHOWCASE: Record<
	CapabilityCatalogId,
	{ template: ShowcaseTemplateId; canvas: ShowcaseCanvasMotif }
> = {
	figma: { template: "chat-over-canvas", canvas: "design" },
	github: { template: "chat-over-canvas", canvas: "code" },
	notion: { template: "chat-over-canvas", canvas: "docs" },
};

export function resolveCapabilityCatalogId(capabilityId: string): CapabilityCatalogId | null {
	return CONNECTOR_CATALOG[capabilityId] ?? null;
}
