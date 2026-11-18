/** Plain session row data for project sidebar views (host maps domain types). */
export interface ProjectSessionRowItem {
	path: string;
	label: string;
	active: boolean;
	renaming: boolean;
	running: boolean;
	scheduled: boolean;
}

export type ProjectTypeIconKey = "normal" | "flowing" | "batch";

export const PROJECT_TYPE_ICONS: Record<ProjectTypeIconKey, string> = {
	normal: "icon-[tabler--folder]",
	flowing: "icon-[solar--transfer-horizontal-linear]",
	batch: "icon-[tabler--folders]",
};

export const REMOTE_PROJECT_ICON = "icon-[tabler--folder-share]";

export const DEFAULT_VISIBLE_SESSIONS = 5;
export const VIRTUAL_SESSION_ROW_HEIGHT = 34;
export const VIRTUAL_SESSION_OVERSCAN = 120;
