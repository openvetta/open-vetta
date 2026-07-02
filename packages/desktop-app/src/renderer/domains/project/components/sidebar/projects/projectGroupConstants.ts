import type { ProjectType } from "@shared/store/atoms";

export const DEFAULT_VISIBLE_SESSIONS = 5;
export const VIRTUAL_SESSION_ROW_HEIGHT = 34;
export const VIRTUAL_SESSION_MAX_HEIGHT = 360;
export const VIRTUAL_SESSION_OVERSCAN = 120;

export const PROJECT_TYPE_ICONS: Record<ProjectType, string> = {
	normal: "icon-[solar--folder-linear]",
	flowing: "icon-[solar--transfer-horizontal-linear]",
	batch: "icon-[solar--layers-minimalistic-linear]",
};
